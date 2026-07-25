import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { WebhookSignatureService } from './webhook-signature.service';
import { WebhookProcessedEvent } from '../entities/webhook-processed-event.entity';

describe('WebhookSignatureService', () => {
  let service: WebhookSignatureService;
  let configService: ConfigService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const SECRET = 'test-secret';

  const sign = (body: string, secret = SECRET) =>
    crypto.createHmac('sha256', secret).update(body).digest('hex');

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepository.create.mockImplementation((entity) => entity);
    mockRepository.save.mockImplementation((entity) => Promise.resolve(entity));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSignatureService,
        {
          provide: getRepositoryToken(WebhookProcessedEvent),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'WEBHOOK_HMAC_SECRET') return SECRET;
              if (key === 'WEBHOOK_REPLAY_WINDOW_SECONDS') return 300;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookSignatureService>(WebhookSignatureService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifySignature', () => {
    it('returns true for a valid signature', () => {
      const body = JSON.stringify({ event_id: 'evt_1' });
      const signature = sign(body);

      expect(service.verifySignature(body, signature, SECRET)).toBe(true);
    });

    it('returns false when signature header is missing', () => {
      const body = JSON.stringify({ event_id: 'evt_1' });

      expect(service.verifySignature(body, undefined, SECRET)).toBe(false);
    });

    it('returns false when signature header is empty', () => {
      const body = JSON.stringify({ event_id: 'evt_1' });

      expect(service.verifySignature(body, '', SECRET)).toBe(false);
    });

    it('returns false for a wrong signature', () => {
      const body = JSON.stringify({ event_id: 'evt_1' });
      const wrongSignature = sign(body, 'a-different-secret');

      expect(service.verifySignature(body, wrongSignature, SECRET)).toBe(false);
    });

    it('returns false for a signature of different length without throwing', () => {
      const body = JSON.stringify({ event_id: 'evt_1' });

      expect(() =>
        service.verifySignature(body, 'not-a-real-hex-digest', SECRET),
      ).not.toThrow();
      expect(
        service.verifySignature(body, 'not-a-real-hex-digest', SECRET),
      ).toBe(false);
    });
  });

  describe('getSecret', () => {
    it('reads WEBHOOK_HMAC_SECRET from ConfigService', () => {
      const result = service.getSecret();

      expect(configService.get).toHaveBeenCalledWith('WEBHOOK_HMAC_SECRET');
      expect(result).toBe(SECRET);
    });
  });

  describe('getReplayWindowMs', () => {
    it('reads WEBHOOK_REPLAY_WINDOW_SECONDS from ConfigService and converts to ms', () => {
      const result = service.getReplayWindowMs();

      expect(configService.get).toHaveBeenCalledWith(
        'WEBHOOK_REPLAY_WINDOW_SECONDS',
      );
      expect(result).toBe(300 * 1000);
    });

    it('defaults to 300 seconds when not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebhookSignatureService,
          {
            provide: getRepositoryToken(WebhookProcessedEvent),
            useValue: mockRepository,
          },
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(undefined) },
          },
        ],
      }).compile();

      const svc = module.get<WebhookSignatureService>(WebhookSignatureService);
      expect(svc.getReplayWindowMs()).toBe(300 * 1000);
    });
  });

  describe('isReplay', () => {
    it('returns false when no prior record exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.isReplay('provider-x', 'evt_1');

      expect(result).toBe(false);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { source: 'provider-x', event_id: 'evt_1' },
      });
    });

    it('returns true when a prior record exists within the replay window', async () => {
      mockRepository.findOne.mockResolvedValue({
        source: 'provider-x',
        event_id: 'evt_1',
        received_at: new Date(Date.now() - 10 * 1000), // 10s ago, window is 300s
      });

      const result = await service.isReplay('provider-x', 'evt_1');

      expect(result).toBe(true);
    });

    it('returns false when a prior record exists but is older than the replay window', async () => {
      mockRepository.findOne.mockResolvedValue({
        source: 'provider-x',
        event_id: 'evt_1',
        received_at: new Date(Date.now() - 600 * 1000), // 600s ago, window is 300s
      });

      const result = await service.isReplay('provider-x', 'evt_1');

      expect(result).toBe(false);
    });
  });

  describe('recordProcessed', () => {
    it('creates and saves a WebhookProcessedEvent row', async () => {
      await service.recordProcessed('provider-x', 'evt_1');

      expect(mockRepository.create).toHaveBeenCalledWith({
        source: 'provider-x',
        event_id: 'evt_1',
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('swallows a unique-constraint conflict from a concurrent duplicate save', async () => {
      mockRepository.save.mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );

      await expect(
        service.recordProcessed('provider-x', 'evt_1'),
      ).resolves.not.toThrow();
    });
  });
});
