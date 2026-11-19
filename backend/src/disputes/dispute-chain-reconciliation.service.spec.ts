import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DisputeChainReconciliationService, DisputeChainMismatchKind } from './dispute-chain-reconciliation.service';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { User } from '../users/entities/user.entity';
import { SorobanService } from '../soroban/soroban.service';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';

describe('DisputeChainReconciliationService', () => {
  let service: DisputeChainReconciliationService;
  let configService: ConfigService;
  let mockDisputeRepository: any;
  let mockUserRepository: any;
  let mockSorobanService: any;
  let mockNotificationService: any;

  beforeEach(async () => {
    mockDisputeRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
    };

    mockUserRepository = {
      find: jest.fn(),
    };

    mockSorobanService = {
      getDispute: jest.fn(),
    };

    mockNotificationService = {
      sendDriftAlert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputeChainReconciliationService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: mockDisputeRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: SorobanService,
          useValue: mockSorobanService,
        },
        {
          provide: NotificationGeneratorService,
          useValue: mockNotificationService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DisputeChainReconciliationService>(
      DisputeChainReconciliationService,
    );
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('isEnabled', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return true when DISPUTE_CHAIN_RECONCILE_ENABLED is not set', () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when DISPUTE_CHAIN_RECONCILE_ENABLED is "false"', () => {
      jest.spyOn(configService, 'get').mockReturnValue('false');

      expect(service.isEnabled()).toBe(false);
    });

    it('should return false when DISPUTE_CHAIN_RECONCILE_ENABLED is "0"', () => {
      jest.spyOn(configService, 'get').mockReturnValue('0');

      expect(service.isEnabled()).toBe(false);
    });

    it('should return true for other values', () => {
      jest.spyOn(configService, 'get').mockReturnValue('true');

      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('getLastReport', () => {
    it('should return null initially', () => {
      expect(service.getLastReport()).toBeNull();
    });
  });

  describe('reconcile', () => {
    beforeEach(() => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'DISPUTE_CHAIN_RECONCILE_ENABLED') return 'true';
        return undefined;
      });

      mockDisputeRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      mockDisputeRepository.find.mockResolvedValue([]);
      mockDisputeRepository.update.mockResolvedValue({ affected: 1 });
    });

    it('should return null when reconciliation is already running', async () => {
      // Set service to running state
      (service as any).isRunning = true;

      const result = await service.reconcile();

      expect(result).toBeNull();
    });

    it('should return a reconciliation report on completion', async () => {
      const result = await service.reconcile();

      expect(result).toBeDefined();
      expect(result?.marketsChecked).toEqual(0);
      expect(result?.disputesChecked).toEqual(0);
      expect(result?.corrected).toEqual(0);
      expect(result?.failedMarkets).toEqual([]);
      expect(result?.mismatches).toEqual([]);
      expect(result?.driftDetected).toBe(false);
      expect(result?.driftSeverity).toBe('none');
    });

    it('should have start and end timestamps in report', async () => {
      const result = await service.reconcile();

      expect(result?.startedAt).toBeDefined();
      expect(result?.finishedAt).toBeDefined();
      expect(new Date(result?.startedAt!).getTime()).toBeLessThanOrEqual(
        new Date(result?.finishedAt!).getTime(),
      );
    });

    it('should reset isRunning flag after reconciliation', async () => {
      await service.reconcile();

      expect((service as any).isRunning).toBe(false);
    });

    it('should store report in lastReport', async () => {
      const result = await service.reconcile();

      expect(service.getLastReport()).toEqual(result);
    });

    it('should reset isRunning even on error', async () => {
      mockDisputeRepository.createQueryBuilder.mockImplementation(() => {
        throw new Error('Query failed');
      });

      try {
        await service.reconcile();
      } catch {
        // Expected to fail
      }

      expect((service as any).isRunning).toBe(false);
    });
  });

  describe('DisputeChainMismatchKind', () => {
    it('should define MISSING_CHAIN_ID', () => {
      expect(DisputeChainMismatchKind.MISSING_CHAIN_ID).toBe('missing_chain_id');
    });

    it('should define CHAIN_ID_MISMATCH', () => {
      expect(DisputeChainMismatchKind.CHAIN_ID_MISMATCH).toBe('chain_id_mismatch');
    });

    it('should define NOT_FOUND_ON_CHAIN', () => {
      expect(DisputeChainMismatchKind.NOT_FOUND_ON_CHAIN).toBe(
        'not_found_on_chain',
      );
    });

    it('should define RESOLUTION_MISMATCH', () => {
      expect(DisputeChainMismatchKind.RESOLUTION_MISMATCH).toBe(
        'resolution_mismatch',
      );
    });
  });

  describe('reconciliation report structure', () => {
    beforeEach(() => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      mockDisputeRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      mockDisputeRepository.find.mockResolvedValue([]);
    });

    it('should have correct report properties', async () => {
      const report = await service.reconcile();

      expect(report).toHaveProperty('marketsChecked');
      expect(report).toHaveProperty('disputesChecked');
      expect(report).toHaveProperty('corrected');
      expect(report).toHaveProperty('failedMarkets');
      expect(report).toHaveProperty('mismatches');
      expect(report).toHaveProperty('driftDetected');
      expect(report).toHaveProperty('driftSeverity');
      expect(report).toHaveProperty('driftPercentage');
      expect(report).toHaveProperty('startedAt');
      expect(report).toHaveProperty('finishedAt');
    });

    it('should initialize report with correct default values', async () => {
      const report = await service.reconcile();

      expect(report?.corrected).toBe(0);
      expect(Array.isArray(report?.failedMarkets)).toBe(true);
      expect(Array.isArray(report?.mismatches)).toBe(true);
      expect(report?.driftDetected).toBe(false);
      expect(['none', 'warning', 'critical']).toContain(report?.driftSeverity);
    });
  });

  describe('batch processing', () => {
    beforeEach(() => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'DISPUTE_CHAIN_RECONCILE_BATCH_SIZE') return '50';
        return undefined;
      });

      mockDisputeRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      mockDisputeRepository.find.mockResolvedValue([]);
    });

    it('should use default batch size when not configured', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      await service.reconcile();

      // Should use DEFAULT_RECONCILE_BATCH_SIZE (50)
      const qb = mockDisputeRepository.createQueryBuilder();
      expect(qb.limit).toHaveBeenCalled();
    });

    it('should use configured batch size', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('100');

      await service.reconcile();

      const qb = mockDisputeRepository.createQueryBuilder();
      expect(qb.limit).toHaveBeenCalled();
    });
  });
});
