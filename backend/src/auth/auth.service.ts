import {
  Injectable,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthAuditEvent } from './entities/auth-audit-event.entity';
import {
  AuthAuditEventType,
  AuthAuditOutcome,
} from './auth-audit-event-types';

const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30;

@Injectable()
export class AuthService implements OnModuleInit {
  private challengeCache = new Map<
    string,
    { expiresAt: number; used: boolean }
  >();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserPreferences)
    private readonly preferencesRepository: Repository<UserPreferences>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    @InjectRepository(AuthAuditEvent)
    private readonly authAuditEventsRepository: Repository<AuthAuditEvent>,
  ) {}

  onModuleInit() {
    this.logger.log('AuthService initialized - periodic cleanup enabled');
  }

  /**
   * Writes one row to `auth_audit_events`. Used for every security-relevant
   * auth action (login, refresh, revoke) — both successes and failures.
   *
   * `metadata` always carries `outcome` and `ip` so the audit trail is
   * queryable without parsing `event_type` strings. A failure to write the
   * audit row is logged but never allowed to break the underlying auth
   * flow (e.g. throwing the real UnauthorizedException instead of a 500).
   */
  private async recordAuditEvent(params: {
    eventType: string;
    userId: string | null;
    familyId?: string | null;
    outcome: AuthAuditOutcome;
    ip?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const auditEvent = this.authAuditEventsRepository.create({
        event_type: params.eventType,
        user_id: params.userId,
        family_id: params.familyId ?? null,
        metadata: {
          outcome: params.outcome,
          ip: params.ip ?? null,
          ...params.metadata,
        },
      });
      await this.authAuditEventsRepository.save(auditEvent);
    } catch (error) {
      this.logger.error(
        `Failed to record auth audit event '${params.eventType}': ${error}`,
      );
    }
  }

  /**
   * Periodically cleanup expired challenges every 5 minutes.
   * This prevents memory leaks in read-heavy load scenarios where
   * verifySignature is called frequently without intervening generateChallenge calls.
   */
  @Cron('*/5 * * * *')
  cleanupExpiredChallenges(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.challengeCache.entries()) {
      if (now > entry.expiresAt) {
        this.challengeCache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(
        `Periodic cleanup removed ${removed} expired challenge(s)`,
      );
    }
  }

  generateChallenge(stellar_address: string): string {
    const timestamp = Date.now();
    const random = randomBytes(16).toString('hex');
    const challenge = `InsightArena:nonce:${timestamp}:${random}:${stellar_address}`;

    this.logger.debug(
      `Generating challenge for ${stellar_address}: ${challenge}`,
    );

    this.challengeCache.set(challenge, {
      expiresAt: timestamp + this.TTL_MS,
      used: false,
    });

    return challenge;
  }

  isValidChallenge(challenge: string): boolean {
    const entry = this.challengeCache.get(challenge);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.challengeCache.delete(challenge);
      return false;
    }

    return true;
  }

  removeChallenge(challenge: string): void {
    this.challengeCache.delete(challenge);
  }

  async verifyChallenge(
    stellar_address: string,
    signed_challenge: string,
    ip?: string | null,
  ): Promise<{ access_token: string; refresh_token: string; user: User }> {
    let user: User;
    try {
      user = await this.verifySignature(stellar_address, signed_challenge);
    } catch (error) {
      await this.recordAuditEvent({
        eventType: AuthAuditEventType.LOGIN_FAILURE,
        userId: null,
        outcome: 'failure',
        ip,
        metadata: {
          stellar_address,
          reason: error instanceof Error ? error.message : 'unknown_error',
        },
      });
      throw error;
    }

    // Sign JWT with sub: user.id
    const payload = { sub: user.id, stellar_address: user.stellar_address };
    const access_token = await this.jwtService.signAsync(payload);

    // Start a brand-new refresh token family for this login session.
    const familyId = randomUUID();
    const { raw: refresh_token } = await this.issueRefreshToken(
      user.id,
      familyId,
    );

    await this.recordAuditEvent({
      eventType: AuthAuditEventType.LOGIN_SUCCESS,
      userId: user.id,
      familyId,
      outcome: 'success',
      ip,
      metadata: { stellar_address: user.stellar_address },
    });

    return { access_token, refresh_token, user };
  }

  /** sha256 hex digest — fast, deterministic lookup key for a raw refresh token. */
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Mints and persists a fresh refresh token row for `userId` within
   * `familyId`. `previousTokenId` is set when this call is part of a
   * rotation (chains the new row back to the token it replaced).
   */
  private async issueRefreshToken(
    userId: string,
    familyId: string,
    previousTokenId: string | null = null,
  ): Promise<{ raw: string; entity: RefreshToken }> {
    const raw = randomBytes(48).toString('hex');
    const ttlDays =
      this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS') ??
      DEFAULT_REFRESH_TOKEN_TTL_DAYS;
    const expires_at = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const entity = this.refreshTokensRepository.create({
      user_id: userId,
      family_id: familyId,
      token_hash: this.hashToken(raw),
      previous_token_id: previousTokenId,
      expires_at,
    });
    const saved = await this.refreshTokensRepository.save(entity);

    return { raw, entity: saved };
  }

  /**
   * Rotates a refresh token: validates it, revokes it, and issues a new
   * token in the same family. If the presented token was already rotated
   * away (i.e. someone is replaying a stolen/used token), the entire
   * session family is revoked and an audit event is recorded.
   */
  async rotateRefreshToken(
    rawToken: string,
    ip?: string | null,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.refreshTokensRepository.findOneBy({
      token_hash: tokenHash,
    });

    if (!existing) {
      await this.recordAuditEvent({
        eventType: AuthAuditEventType.REFRESH_FAILURE,
        userId: null,
        outcome: 'failure',
        ip,
        metadata: { reason: 'invalid_refresh_token' },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const now = new Date();

    if (existing.expires_at < now) {
      await this.recordAuditEvent({
        eventType: AuthAuditEventType.REFRESH_FAILURE,
        userId: existing.user_id,
        familyId: existing.family_id,
        outcome: 'failure',
        ip,
        metadata: { reason: 'refresh_token_expired', tokenId: existing.id },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    if (existing.revoked_at) {
      // Reuse of an already-rotated token: treat as compromise and revoke
      // the whole session family.
      await this.refreshTokensRepository.update(
        { family_id: existing.family_id, revoked_at: IsNull() },
        { revoked_at: now },
      );

      await this.recordAuditEvent({
        eventType: AuthAuditEventType.REFRESH_TOKEN_REUSE_DETECTED,
        userId: existing.user_id,
        familyId: existing.family_id,
        outcome: 'failure',
        ip,
        metadata: { tokenId: existing.id, reason: 'refresh_token_reuse' },
      });

      this.logger.error(
        `Refresh token reuse detected for family ${existing.family_id}, user ${existing.user_id} — session revoked`,
      );

      throw new UnauthorizedException(
        'Refresh token reuse detected; session revoked',
      );
    }

    const user = await this.usersRepository.findOneBy({
      id: existing.user_id,
    });
    if (!user) {
      await this.recordAuditEvent({
        eventType: AuthAuditEventType.REFRESH_FAILURE,
        userId: existing.user_id,
        familyId: existing.family_id,
        outcome: 'failure',
        ip,
        metadata: { reason: 'user_not_found', tokenId: existing.id },
      });
      throw new UnauthorizedException('User not found or has been deleted');
    }

    // Invalidate the presented token.
    existing.revoked_at = now;
    await this.refreshTokensRepository.save(existing);

    // Issue the next token in the same family, chained to the one just used.
    const { raw: refresh_token } = await this.issueRefreshToken(
      user.id,
      existing.family_id,
      existing.id,
    );

    const payload = { sub: user.id, stellar_address: user.stellar_address };
    const access_token = await this.jwtService.signAsync(payload);

    this.logger.debug(`Refresh token rotated for user ${user.id}`);

    await this.recordAuditEvent({
      eventType: AuthAuditEventType.REFRESH_SUCCESS,
      userId: user.id,
      familyId: existing.family_id,
      outcome: 'success',
      ip,
      metadata: { tokenId: existing.id },
    });

    return { access_token, refresh_token };
  }

  /**
   * Revokes the session (refresh token family) identified by `rawToken`,
   * scoped to `userId` — a user may only revoke their own sessions. This is
   * the "logout" action: it invalidates every non-revoked refresh token in
   * the family so the presented token (and any token already rotated from
   * it) can no longer mint new access tokens.
   */
  async revokeSession(
    userId: string,
    rawToken: string,
    ip?: string | null,
  ): Promise<{ revoked: boolean }> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.refreshTokensRepository.findOneBy({
      token_hash: tokenHash,
    });

    if (!existing || existing.user_id !== userId) {
      await this.recordAuditEvent({
        eventType: AuthAuditEventType.REVOKE_FAILURE,
        userId,
        outcome: 'failure',
        ip,
        metadata: { reason: 'refresh_token_not_found' },
      });
      throw new UnauthorizedException('Refresh token not found');
    }

    await this.refreshTokensRepository.update(
      { family_id: existing.family_id, revoked_at: IsNull() },
      { revoked_at: new Date() },
    );

    this.logger.debug(
      `Session revoked for user ${userId}, family ${existing.family_id}`,
    );

    await this.recordAuditEvent({
      eventType: AuthAuditEventType.REVOKE_SUCCESS,
      userId,
      familyId: existing.family_id,
      outcome: 'success',
      ip,
      metadata: { tokenId: existing.id },
    });

    return { revoked: true };
  }

  async verifySignature(
    stellar_address: string,
    signed_challenge: string,
  ): Promise<User> {
    this.logger.debug(`Verifying challenge for ${stellar_address}`);

    // Find a valid, unused challenge for this address
    const challenge = this.findValidChallengeForAddress(stellar_address);
    if (!challenge) {
      this.logger.debug(`No valid challenge found for ${stellar_address}`);
      throw new UnauthorizedException(
        'No valid challenge found or challenge expired',
      );
    }

    this.logger.debug(`Found challenge: ${challenge}`);

    const entry = this.challengeCache.get(challenge)!;

    // Replay attack prevention: reject already-used nonces
    if (entry.used) {
      this.logger.debug(`Challenge already used for ${stellar_address}`);
      throw new UnauthorizedException('Challenge already used');
    }

    // Verify the Stellar signature cryptographically
    const isValid = this.verifyStellarSignature(
      stellar_address,
      challenge,
      signed_challenge,
    );

    this.logger.debug(`Signature valid: ${isValid}`);

    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Mark nonce as used (replay prevention)
    entry.used = true;

    // Upsert the user record
    let user = await this.usersRepository.findOneBy({ stellar_address });
    const isNewUser = !user;
    if (!user) {
      this.logger.debug(`Creating new user for ${stellar_address}`);
      user = this.usersRepository.create({ stellar_address });
    }
    user = await this.usersRepository.save(user);

    if (isNewUser) {
      const existingPrefs = await this.preferencesRepository.findOneBy({
        userId: user.id,
      });
      if (!existingPrefs) {
        const prefs = this.preferencesRepository.create({ userId: user.id });
        await this.preferencesRepository.save(prefs);
      }
    }

    return user;
  }

  /** Finds the most recent valid (non-expired) challenge for a given address. */
  private findValidChallengeForAddress(stellar_address: string): string | null {
    const now = Date.now();
    for (const [key, entry] of this.challengeCache.entries()) {
      if (key.endsWith(`:${stellar_address}`) && now <= entry.expiresAt) {
        return key;
      }
    }
    return null;
  }

  /**
   * Verifies a Stellar Ed25519 signature.
   * @param stellar_address  The G... public key of the signer.
   * @param challenge        The plaintext challenge that was signed.
   * @param signed_challenge Hex-encoded signature produced by Freighter.
   */
  verifyStellarSignature(
    stellar_address: string,
    challenge: string,
    signed_challenge: string,
  ): boolean {
    try {
      const keypair = Keypair.fromPublicKey(stellar_address);
      const messageBuffer = Buffer.from(challenge, 'utf-8');
      const signatureBuffer = Buffer.from(signed_challenge, 'hex');
      const isValid = keypair.verify(messageBuffer, signatureBuffer);
      return isValid;
    } catch (error) {
      this.logger.error(`Error verifying signature: ${error}`);
      return false;
    }
  }
}
