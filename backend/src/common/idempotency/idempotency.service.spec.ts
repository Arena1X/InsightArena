import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyKey } from './idempotency-key.entity';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repository: jest.Mocked<
    Pick<
      Repository<IdempotencyKey>,
      'save' | 'create' | 'findOneBy' | 'delete' | 'update'
    >
  >;

  const makeModule = async (
    configOverrides: Record<string, string | number | undefined> = {},
  ) => {
    repository = {
      save: jest.fn(),
      create: jest.fn((entity) => entity as IdempotencyKey),
      findOneBy: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: getRepositoryToken(IdempotencyKey), useValue: repository },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configOverrides[key]),
          },
        },
      ],
    }).compile();

    return module.get<IdempotencyService>(IdempotencyService);
  };

  const uniqueViolation = () => {
    const err = new Error('duplicate key value violates unique constraint');
    (err as { code?: string }).code = '23505';
    return err;
  };

  const makeRecord = (overrides: Partial<IdempotencyKey> = {}) =>
    ({
      id: 'record-1',
      key: 'a-key',
      userId: 'user-1',
      request_hash: 'hash-1',
      status_code: null,
      response_body: null,
      in_progress: true,
      created_at: new Date(),
      ...overrides,
    }) as IdempotencyKey;

  beforeEach(async () => {
    service = await makeModule();
  });

  describe('configurable TTL', () => {
    it('defaults to a 24 hour window when no env var is configured', async () => {
      const svc = await makeModule();
      expect(svc.ttlMilliseconds).toBe(24 * 60 * 60 * 1000);
    });

    it('honors IDEMPOTENCY_KEY_TTL_HOURS from configuration', async () => {
      const svc = await makeModule({ IDEMPOTENCY_KEY_TTL_HOURS: '1' });
      expect(svc.ttlMilliseconds).toBe(1 * 60 * 60 * 1000);
    });

    it('falls back to the default for an invalid TTL value', async () => {
      const svc = await makeModule({ IDEMPOTENCY_KEY_TTL_HOURS: 'nonsense' });
      expect(svc.ttlMilliseconds).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('acquire', () => {
    it('claims a fresh key on first use', async () => {
      const inserted = makeRecord();
      repository.save.mockResolvedValueOnce(inserted);

      const result = await service.acquire('a-key', 'user-1', 'hash-1');

      expect(result).toEqual({ acquired: true, record: inserted });
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('returns acquired:false with the existing record on replay (same key, not expired)', async () => {
      repository.save.mockRejectedValueOnce(uniqueViolation());
      const existing = makeRecord({
        in_progress: false,
        request_hash: 'hash-1',
        response_body: { ok: true },
        status_code: 201,
      });
      repository.findOneBy.mockResolvedValueOnce(existing);

      const result = await service.acquire('a-key', 'user-1', 'hash-1');

      expect(result).toEqual({ acquired: false, record: existing });
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('propagates non-unique-violation errors', async () => {
      const err = new Error('connection lost');
      repository.save.mockRejectedValueOnce(err);

      await expect(
        service.acquire('a-key', 'user-1', 'hash-1'),
      ).rejects.toThrow('connection lost');
    });

    it('re-throws the original error if the conflicting row cannot be found', async () => {
      const err = uniqueViolation();
      repository.save.mockRejectedValueOnce(err);
      repository.findOneBy.mockResolvedValueOnce(null);

      await expect(service.acquire('a-key', 'user-1', 'hash-1')).rejects.toBe(
        err,
      );
    });

    it('purges an expired key and re-acquires as a fresh request', async () => {
      const svc = await makeModule({ IDEMPOTENCY_KEY_TTL_HOURS: '1' });

      const expired = makeRecord({
        id: 'expired-record',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h old, ttl is 1h
      });
      const fresh = makeRecord({ id: 'fresh-record' });

      repository.save
        .mockRejectedValueOnce(uniqueViolation())
        .mockResolvedValueOnce(fresh);
      repository.findOneBy.mockResolvedValueOnce(expired);
      repository.delete.mockResolvedValueOnce({ affected: 1 } as any);

      const result = await svc.acquire('a-key', 'user-1', 'hash-1');

      expect(repository.delete).toHaveBeenCalledWith('expired-record');
      expect(result).toEqual({ acquired: true, record: fresh });
    });

    it('does not treat a key within the configured window as expired', async () => {
      const svc = await makeModule({ IDEMPOTENCY_KEY_TTL_HOURS: '24' });

      const recent = makeRecord({
        created_at: new Date(Date.now() - 60 * 1000), // 1 minute old
        in_progress: false,
      });
      repository.save.mockRejectedValueOnce(uniqueViolation());
      repository.findOneBy.mockResolvedValueOnce(recent);

      const result = await svc.acquire('a-key', 'user-1', 'hash-1');

      expect(result).toEqual({ acquired: false, record: recent });
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('persists the response and clears in_progress', async () => {
      await service.complete('record-1', 201, { id: 'x' });

      expect(repository.update).toHaveBeenCalledWith('record-1', {
        status_code: 201,
        response_body: { id: 'x' },
        in_progress: false,
      });
    });
  });

  describe('release', () => {
    it('deletes the key so the client can retry', async () => {
      await service.release('record-1');

      expect(repository.delete).toHaveBeenCalledWith('record-1');
    });
  });

  describe('cleanupExpiredKeys', () => {
    it('deletes rows older than the configured TTL', async () => {
      const svc = await makeModule({ IDEMPOTENCY_KEY_TTL_HOURS: '2' });
      repository.delete.mockResolvedValueOnce({ affected: 3 } as any);

      await svc.cleanupExpiredKeys();

      expect(repository.delete).toHaveBeenCalledTimes(1);
      const [criteria] = repository.delete.mock.calls[0];
      expect(criteria).toHaveProperty('created_at');
    });
  });
});
