import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { ApiKey } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import {
  ApiKeyCreatedResponseDto,
  ApiKeyListItemDto,
} from './dto/api-key-response.dto';

/** Throttle window for last_used_at writes (60 seconds) */
const LAST_USED_THROTTLE_MS = 60_000;

/** Default grace window (ms) a rotated-out key remains valid for */
const DEFAULT_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** bcrypt cost factor */
const BCRYPT_ROUNDS = 10;

/** Raw key prefix — makes keys identifiable in logs */
const KEY_PREFIX = 'ia_';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  /**
   * Create a new API key for the given user.
   * The raw key is returned ONCE and never stored — only its bcrypt hash is persisted.
   */
  async create(
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyCreatedResponseDto> {
    const rawKey = `${KEY_PREFIX}${randomBytes(32).toString('hex')}`;
    const key_prefix = rawKey.slice(0, 10); // 'ia_' + first 7 hex chars
    const key_hash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

    const apiKey = this.apiKeyRepository.create({
      userId,
      name: dto.name,
      key_prefix,
      key_hash,
      scopes: dto.scopes,
      expires_at: dto.expires_at ? new Date(dto.expires_at) : null,
      revoked_at: null,
      last_used_at: null,
    });

    const saved = await this.apiKeyRepository.save(apiKey);

    this.logger.log(`API key created: id=${saved.id} userId=${userId}`);

    return {
      id: saved.id,
      name: saved.name,
      key: rawKey,
      key_prefix: saved.key_prefix,
      scopes: saved.scopes,
      expires_at: saved.expires_at,
      created_at: saved.created_at,
    };
  }

  /** List all (non-deleted) keys belonging to a user — never includes hashes. */
  async listForUser(userId: string): Promise<ApiKeyListItemDto[]> {
    const keys = await this.apiKeyRepository.find({
      where: { userId },
      order: { created_at: 'DESC' },
    });

    return keys.map((k) => this.toListItem(k));
  }

  /**
   * Revoke a key owned by userId.
   * Throws NotFoundException if the key doesn't exist or doesn't belong to the user.
   * Throws ForbiddenException if the key is already revoked.
   */
  async revoke(id: string, userId: string): Promise<ApiKeyListItemDto> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id, userId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    if (apiKey.revoked_at) {
      throw new ForbiddenException('API key is already revoked');
    }

    apiKey.revoked_at = new Date();
    const saved = await this.apiKeyRepository.save(apiKey);

    this.logger.log(`API key revoked: id=${id} userId=${userId}`);

    return this.toListItem(saved);
  }

  /**
   * Validate a raw key sent via X-API-Key header.
   * Returns the matching ApiKey entity (with user relation) if valid.
   * Throws UnauthorizedException for all failure cases (to avoid leaking info).
   */
  async validateKey(rawKey: string): Promise<ApiKey> {
    if (!rawKey?.startsWith(KEY_PREFIX)) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const prefix = rawKey.slice(0, 10);

    // Narrow the candidate set by prefix before the expensive bcrypt compare
    const candidates = await this.apiKeyRepository.find({
      where: { key_prefix: prefix },
      relations: ['user'],
    });

    if (!candidates.length) {
      throw new UnauthorizedException('Invalid API key');
    }

    let matched: ApiKey | null = null;
    for (const candidate of candidates) {
      const valid = await bcrypt.compare(rawKey, candidate.key_hash);
      if (valid) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (matched.revoked_at) {
      throw new UnauthorizedException('API key has been revoked');
    }

    if (matched.expires_at && matched.expires_at < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    if (
      matched.rotated_at &&
      (!matched.grace_expires_at || matched.grace_expires_at < new Date())
    ) {
      throw new UnauthorizedException('API key has been rotated');
    }

    return matched;
  }

  /**
   * Rotate a key owned by userId: issues a brand-new raw key/hash under the
   * same row (preserving id, name, and scopes), and marks the *previous*
   * value as grace-expiring by recording it on a fresh row so the old raw
   * key keeps validating for `graceMs` while callers switch over.
   *
   * Implementation: since only one (key_prefix, key_hash) pair can live on a
   * row, rotation inserts a new row carrying the new key material and points
   * the old row at it via `replaced_by_id`/`rotated_at`/`grace_expires_at` —
   * the old row's own key_hash is untouched, so it keeps validating until
   * grace_expires_at. Mirrors `RefreshToken`'s rotation-chain pattern.
   */
  async rotate(
    id: string,
    userId: string,
    graceMs: number = DEFAULT_ROTATION_GRACE_MS,
  ): Promise<ApiKeyCreatedResponseDto> {
    const existing = await this.apiKeyRepository.findOne({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('API key not found');
    }

    if (existing.revoked_at) {
      throw new ForbiddenException('Cannot rotate a revoked API key');
    }

    if (existing.rotated_at) {
      throw new ForbiddenException('API key has already been rotated');
    }

    const rawKey = `${KEY_PREFIX}${randomBytes(32).toString('hex')}`;
    const key_prefix = rawKey.slice(0, 10);
    const key_hash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

    const replacement = this.apiKeyRepository.create({
      userId,
      name: existing.name,
      key_prefix,
      key_hash,
      scopes: existing.scopes,
      expires_at: existing.expires_at,
      revoked_at: null,
      last_used_at: null,
    });
    const savedReplacement = await this.apiKeyRepository.save(replacement);

    existing.rotated_at = new Date();
    existing.grace_expires_at = new Date(Date.now() + graceMs);
    existing.replaced_by_id = savedReplacement.id;
    await this.apiKeyRepository.save(existing);

    this.logger.log(
      `API key rotated: id=${id} userId=${userId} replacedBy=${savedReplacement.id}`,
    );

    return {
      id: savedReplacement.id,
      name: savedReplacement.name,
      key: rawKey,
      key_prefix: savedReplacement.key_prefix,
      scopes: savedReplacement.scopes,
      expires_at: savedReplacement.expires_at,
      created_at: savedReplacement.created_at,
    };
  }

  /**
   * Throttled update of last_used_at.
   * Only writes to the DB if more than LAST_USED_THROTTLE_MS has elapsed
   * since the last recorded use — avoids a DB write on every single request.
   * Fire-and-forget: errors are logged but not propagated.
   */
  touchLastUsed(apiKey: ApiKey): void {
    const now = Date.now();
    const last = apiKey.last_used_at?.getTime() ?? 0;

    if (now - last < LAST_USED_THROTTLE_MS) {
      return; // skip — within throttle window
    }

    this.apiKeyRepository
      .update(apiKey.id, { last_used_at: new Date() })
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to update last_used_at for key ${apiKey.id}: ${String(err)}`,
        ),
      );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toListItem(k: ApiKey): ApiKeyListItemDto {
    return {
      id: k.id,
      name: k.name,
      key_prefix: k.key_prefix,
      scopes: k.scopes,
      expires_at: k.expires_at,
      last_used_at: k.last_used_at,
      revoked_at: k.revoked_at,
      rotated_at: k.rotated_at,
      grace_expires_at: k.grace_expires_at,
      replaced_by_id: k.replaced_by_id,
      created_at: k.created_at,
    };
  }
}
