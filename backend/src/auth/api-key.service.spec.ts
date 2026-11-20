import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiKeyService } from './api-key.service';
import { ApiKey } from './entities/api-key.entity';
import * as bcrypt from 'bcrypt';
import {
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

jest.mock('bcrypt');

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let repository: any;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  describe('create', () => {
    it('should create an API key with scopes', async () => {
      const mockDto = { name: 'Test Key', scopes: ['read:test', 'write:test'] };
      const mockApiKey = {
        id: 'key123',
        name: mockDto.name,
        key_prefix: 'ia_abcdef',
        scopes: mockDto.scopes,
        created_at: new Date(),
      };

      repository.create.mockReturnValue(mockApiKey);
      repository.save.mockResolvedValue(mockApiKey);

      const result = await service.create('user123', mockDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          name: mockDto.name,
          scopes: mockDto.scopes,
        }),
      );
      expect(result.scopes).toEqual(mockDto.scopes);
      expect(result.id).toBe(mockApiKey.id);
    });
  });

  describe('validateKey', () => {
    it('should successfully validate an existing unrevoked key', async () => {
      const rawKey = 'ia_validkey12345';
      const mockApiKey = {
        id: 'key123',
        key_hash: 'hashed',
        revoked_at: null,
        expires_at: null,
      };

      repository.find.mockResolvedValue([mockApiKey]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateKey(rawKey);
      expect(result).toEqual(mockApiKey);
    });

    it('should throw UnauthorizedException for an invalid format', async () => {
      await expect(service.validateKey('invalidformat')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if no candidate matches', async () => {
      repository.find.mockResolvedValue([]);
      await expect(service.validateKey('ia_validkey12345')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject a rotated key whose grace window has expired', async () => {
      const rawKey = 'ia_rotatedkey12345';
      const mockApiKey = {
        id: 'key123',
        key_hash: 'hashed',
        revoked_at: null,
        expires_at: null,
        rotated_at: new Date(Date.now() - 1000),
        grace_expires_at: new Date(Date.now() - 500),
      };

      repository.find.mockResolvedValue([mockApiKey]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.validateKey(rawKey)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should accept a rotated key still within its grace window', async () => {
      const rawKey = 'ia_rotatedkey12345';
      const mockApiKey = {
        id: 'key123',
        key_hash: 'hashed',
        revoked_at: null,
        expires_at: null,
        rotated_at: new Date(Date.now() - 1000),
        grace_expires_at: new Date(Date.now() + 60_000),
      };

      repository.find.mockResolvedValue([mockApiKey]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateKey(rawKey);
      expect(result).toEqual(mockApiKey);
    });
  });

  describe('rotate', () => {
    it('should issue a new key preserving name/scopes and grace-expire the old one', async () => {
      const existing = {
        id: 'key123',
        userId: 'user123',
        name: 'My Key',
        scopes: ['read:markets'],
        expires_at: null,
        revoked_at: null,
        rotated_at: null,
        grace_expires_at: null,
        replaced_by_id: null,
      };
      const replacement = {
        id: 'key456',
        name: existing.name,
        key_prefix: 'ia_newpre',
        scopes: existing.scopes,
        expires_at: null,
        created_at: new Date(),
      };

      repository.findOne.mockResolvedValue(existing);
      repository.create.mockReturnValue(replacement);
      repository.save
        .mockResolvedValueOnce(replacement)
        .mockResolvedValueOnce({ ...existing, rotated_at: new Date() });

      const result = await service.rotate('key123', 'user123');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          name: existing.name,
          scopes: existing.scopes,
        }),
      );
      expect(result.id).toBe(replacement.id);
      expect(result.key).toMatch(/^ia_/);

      // Second save call persists the grace-expiry state on the old row.
      const oldRowSaveArg = repository.save.mock.calls[1][0];
      expect(oldRowSaveArg.rotated_at).toBeInstanceOf(Date);
      expect(oldRowSaveArg.grace_expires_at).toBeInstanceOf(Date);
      expect(oldRowSaveArg.replaced_by_id).toBe(replacement.id);
    });

    it('should throw NotFoundException for an unknown key', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.rotate('missing', 'user123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when rotating a revoked key', async () => {
      repository.findOne.mockResolvedValue({
        id: 'key123',
        revoked_at: new Date(),
        rotated_at: null,
      });
      await expect(service.rotate('key123', 'user123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when rotating an already-rotated key', async () => {
      repository.findOne.mockResolvedValue({
        id: 'key123',
        revoked_at: null,
        rotated_at: new Date(),
      });
      await expect(service.rotate('key123', 'user123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    /**
     * Note on issue #1849's premise: the old key is NOT rejected immediately
     * by default — rotate() defaults graceMs to a 24h grace window
     * (DEFAULT_ROTATION_GRACE_MS), and validateKey() deliberately keeps a
     * rotated key valid until grace_expires_at (mirrors RefreshToken's
     * rotation-chain pattern; see the JSDoc above `rotate()`). Immediate
     * invalidation only happens when the caller explicitly passes
     * `graceMs: 0`. These tests cover the actual, documented default and
     * the explicit-opt-in immediate case — see PR description for the
     * discrepancy between this issue's premise and the code's actual
     * intended design.
     */
    it('immediately invalidates the old key when rotate() is called with graceMs: 0', async () => {
      const rawKey = 'ia_oldkey12345';
      const existing = {
        id: 'key123',
        userId: 'user123',
        name: 'My Key',
        scopes: ['read:markets'],
        expires_at: null,
        revoked_at: null,
        rotated_at: null,
        grace_expires_at: null,
        replaced_by_id: null,
        key_hash: 'hashed',
      };
      const replacement = {
        id: 'key456',
        name: existing.name,
        key_prefix: 'ia_newpre',
        scopes: existing.scopes,
        expires_at: null,
        created_at: new Date(),
      };

      repository.findOne.mockResolvedValue(existing);
      repository.create.mockReturnValue(replacement);
      let rotatedOldRow: typeof existing & {
        rotated_at: Date;
        grace_expires_at: Date;
      };
      repository.save.mockImplementation((row: any) => {
        if (row === replacement) return Promise.resolve(replacement);
        rotatedOldRow = row;
        return Promise.resolve(row);
      });

      await service.rotate('key123', 'user123', 0);

      // grace_expires_at was set to "now" at rotation time (graceMs: 0).
      // Force it unambiguously into the past for validateKey's own `new
      // Date()` check, rather than relying on however many real
      // milliseconds elapse between the two calls above (which can be too
      // few to make grace_expires_at < new Date() true).
      rotatedOldRow!.grace_expires_at = new Date(
        rotatedOldRow!.grace_expires_at.getTime() - 1,
      );

      repository.find.mockResolvedValue([rotatedOldRow!]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.validateKey(rawKey)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('the newly rotated key validates immediately with the same scopes/owner as the key it replaced', async () => {
      const existing = {
        id: 'key123',
        userId: 'user123',
        name: 'My Key',
        scopes: ['read:markets', 'write:predictions'],
        expires_at: null,
        revoked_at: null,
        rotated_at: null,
        grace_expires_at: null,
        replaced_by_id: null,
      };
      const newKeyRow = {
        id: 'key456',
        userId: existing.userId,
        name: existing.name,
        key_prefix: 'ia_newpre',
        key_hash: 'new-hash',
        scopes: existing.scopes,
        expires_at: null,
        revoked_at: null,
        rotated_at: null,
        grace_expires_at: null,
        created_at: new Date(),
      };

      repository.findOne.mockResolvedValue(existing);
      repository.create.mockReturnValue(newKeyRow);
      repository.save
        .mockResolvedValueOnce(newKeyRow)
        .mockResolvedValueOnce({ ...existing, rotated_at: new Date() });

      const rotateResult = await service.rotate('key123', 'user123');

      expect(rotateResult.scopes).toEqual(existing.scopes);

      // The freshly issued raw key validates immediately: no rotated_at of
      // its own, so validateKey's grace-window check never applies to it.
      repository.find.mockResolvedValue([newKeyRow]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const validated = await service.validateKey(rotateResult.key);
      expect(validated.userId).toBe(existing.userId);
      expect(validated.scopes).toEqual(existing.scopes);
    });
  });

  describe('touchLastUsed', () => {
    const makeKey = (overrides: Partial<ApiKey> = {}): ApiKey =>
      ({
        id: 'key123',
        last_used_at: null,
        revoked_at: null,
        ...overrides,
      }) as ApiKey;

    it('completes without throwing when called concurrently for the same key', async () => {
      repository.update.mockResolvedValue({ affected: 1 });
      const apiKey = makeKey();

      // touchLastUsed is fire-and-forget (returns void, not a Promise), so
      // "doesn't throw" means the synchronous call itself never throws even
      // when several land back-to-back for the same row.
      expect(() => {
        service.touchLastUsed(apiKey);
        service.touchLastUsed(apiKey);
        service.touchLastUsed(apiKey);
      }).not.toThrow();

      // Let the fire-and-forget update() promises settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    it('does not propagate a rejected update() as an unhandled/thrown error', async () => {
      repository.update.mockRejectedValue(
        new Error('could not obtain lock on row'),
      );
      const apiKey = makeKey();

      expect(() => service.touchLastUsed(apiKey)).not.toThrow();

      // Flush the microtask queue so the .catch() handler in touchLastUsed
      // has a chance to run; if it were missing, this rejection would
      // surface as an unhandled promise rejection instead.
      await new Promise((resolve) => setImmediate(resolve));
    });

    it('writes a valid, non-null last_used_at timestamp for the key being touched', () => {
      repository.update.mockResolvedValue({ affected: 1 });
      const apiKey = makeKey();

      service.touchLastUsed(apiKey);

      expect(repository.update).toHaveBeenCalledWith(
        apiKey.id,
        expect.objectContaining({ last_used_at: expect.any(Date) }),
      );
      const [, patch] = repository.update.mock.calls[0];
      expect(patch.last_used_at).toBeInstanceOf(Date);
      expect(Number.isNaN(patch.last_used_at.getTime())).toBe(false);
    });

    it('only ever writes last_used_at — never touches revoked_at, so a revoked key cannot be resurrected via this path', () => {
      repository.update.mockResolvedValue({ affected: 1 });
      const revokedKey = makeKey({ revoked_at: new Date() });

      service.touchLastUsed(revokedKey);

      const [, patch] = repository.update.mock.calls[0];
      expect(Object.keys(patch)).toEqual(['last_used_at']);
      expect(patch).not.toHaveProperty('revoked_at');
    });

    it('skips the write entirely when called again within the throttle window', () => {
      repository.update.mockResolvedValue({ affected: 1 });
      const apiKey = makeKey({ last_used_at: new Date() });

      service.touchLastUsed(apiKey);

      expect(repository.update).not.toHaveBeenCalled();
    });
  });
});
