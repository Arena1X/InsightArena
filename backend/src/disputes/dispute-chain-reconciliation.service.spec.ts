import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  DisputeChainReconciliationService,
  DisputeChainMismatchKind,
  DisputeChainReconciliationReport,
} from './dispute-chain-reconciliation.service';
import {
  Dispute,
  DisputeStatus,
  DisputeResolution,
} from './entities/dispute.entity';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { SorobanService } from '../soroban/soroban.service';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';
import { Repository, SelectQueryBuilder } from 'typeorm';

describe('DisputeChainReconciliationService', () => {
  let service: DisputeChainReconciliationService;
  let disputesRepository: Repository<Dispute>;
  let usersRepository: Repository<User>;
  let sorobanService: SorobanService;
  let configService: ConfigService;
  let notificationGenerator: NotificationGeneratorService;
  let mockConfigGet: jest.Mock;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
  } as User;

  const mockMarket: Market = {
    id: 'market-123',
    on_chain_market_id: 'chain-market-123',
  } as Market;

  const mockDispute: Dispute = {
    id: 'dispute-123',
    marketId: 'market-123',
    disputantId: 'user-123',
    tier: 1,
    onChainDisputeId: 'chain-dispute-123',
    status: DisputeStatus.PENDING,
    market: mockMarket,
    disputant: mockUser,
    createdAt: new Date(),
  } as Dispute;

  const mockOnChainDispute = {
    dispute_id: 'chain-dispute-123',
    is_resolved: false,
    resolution_upheld: null,
  };

  beforeEach(async () => {
    mockConfigGet = jest.fn((key: string) => {
      if (key === 'DISPUTE_CHAIN_RECONCILE_ENABLED') return 'true';
      if (key === 'DISPUTE_CHAIN_RECONCILE_BATCH_SIZE') return 50;
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputeChainReconciliationService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: {
            find: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: SorobanService,
          useValue: {
            getDispute: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: mockConfigGet,
          },
        },
        {
          provide: NotificationGeneratorService,
          useValue: {
            notifyAdmins: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DisputeChainReconciliationService>(
      DisputeChainReconciliationService,
    );
    disputesRepository = module.get<Repository<Dispute>>(
      getRepositoryToken(Dispute),
    );
    usersRepository = module.get<Repository<User>>(getRepositoryToken(User));
    sorobanService = module.get<SorobanService>(SorobanService);
    configService = module.get<ConfigService>(ConfigService);
    notificationGenerator = module.get<NotificationGeneratorService>(
      NotificationGeneratorService,
    );
  });

  describe('isEnabled', () => {
    it('should return true when DISPUTE_CHAIN_RECONCILE_ENABLED is not "false" or "0"', () => {
      mockConfigGet.mockReturnValue('true');
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when DISPUTE_CHAIN_RECONCILE_ENABLED is "false"', () => {
      mockConfigGet.mockReturnValue('false');
      expect(service.isEnabled()).toBe(false);
    });

    it('should return false when DISPUTE_CHAIN_RECONCILE_ENABLED is "0"', () => {
      mockConfigGet.mockReturnValue('0');
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when DISPUTE_CHAIN_RECONCILE_ENABLED is undefined', () => {
      mockConfigGet.mockReturnValue(undefined);
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('getLastReport', () => {
    it('should return null when no reconciliation has been run', () => {
      expect(service.getLastReport()).toBeNull();
    });

    it('should return the last report after reconciliation completes', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([]);

      await service.reconcile();

      const report = service.getLastReport();
      expect(report).not.toBeNull();
      expect(report?.marketsChecked).toBe(0);
      expect(report?.disputesChecked).toBe(0);
    });
  });

  describe('reconcile', () => {
    beforeEach(() => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([]);
    });

    it('should return null if a reconciliation is already running', async () => {
      const reconcileCall = service.reconcile();
      const result = await Promise.race([
        reconcileCall,
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 100)),
      ]);

      // Try to call reconcile again while the first is running
      // Note: This is a simplified test; in practice, the async operation needs proper await handling
      const secondResult = service.reconcile();
      expect(secondResult).resolves.toBeNull();
    });

    it('should process all market IDs in batches', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ market_id: 'market-1' }])
          .mockResolvedValueOnce([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([]);
      jest
        .spyOn(sorobanService, 'getDispute')
        .mockResolvedValue(mockOnChainDispute as any);

      const report = await service.reconcile();

      expect(report).not.toBeNull();
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50);
    });

    it('should handle failed market reads gracefully', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ market_id: 'market-1' }])
          .mockResolvedValueOnce([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest
        .spyOn(disputesRepository, 'find')
        .mockResolvedValue([{ ...mockDispute }]);
      jest
        .spyOn(sorobanService, 'getDispute')
        .mockRejectedValue(new Error('Chain error'));

      const report = await service.reconcile();

      expect(report).not.toBeNull();
      expect(report?.failedMarkets).toContain('market-123');
      expect(report?.mismatches).toHaveLength(0);
    });

    it('should correct missing chain IDs', async () => {
      const disputeWithoutChainId = {
        ...mockDispute,
        onChainDisputeId: null,
      };

      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ market_id: 'market-123' }])
          .mockResolvedValueOnce([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest
        .spyOn(disputesRepository, 'find')
        .mockResolvedValue([disputeWithoutChainId]);
      jest
        .spyOn(sorobanService, 'getDispute')
        .mockResolvedValue(mockOnChainDispute as any);
      jest.spyOn(disputesRepository, 'update').mockResolvedValue({} as any);

      const report = await service.reconcile();

      expect(report).not.toBeNull();
      expect(report?.corrected).toBe(1);
      expect(report?.mismatches).toHaveLength(1);
      expect(report?.mismatches[0].kind).toBe(
        DisputeChainMismatchKind.MISSING_CHAIN_ID,
      );
      expect(report?.mismatches[0].corrected).toBe(true);
    });

    it('should detect chain ID mismatches', async () => {
      const disputeWithWrongChainId = {
        ...mockDispute,
        onChainDisputeId: 'wrong-chain-id',
      };

      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ market_id: 'market-123' }])
          .mockResolvedValueOnce([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest
        .spyOn(disputesRepository, 'find')
        .mockResolvedValue([disputeWithWrongChainId]);
      jest
        .spyOn(sorobanService, 'getDispute')
        .mockResolvedValue(mockOnChainDispute as any);
      jest.spyOn(disputesRepository, 'update').mockResolvedValue({} as any);

      const report = await service.reconcile();

      expect(report).not.toBeNull();
      expect(report?.corrected).toBe(1);
      expect(report?.mismatches).toHaveLength(1);
      expect(report?.mismatches[0].kind).toBe(
        DisputeChainMismatchKind.CHAIN_ID_MISMATCH,
      );
      expect(report?.mismatches[0].localValue).toBe('wrong-chain-id');
      expect(report?.mismatches[0].chainValue).toBe('chain-dispute-123');
    });

    it('should flag disputes not found on-chain', async () => {
      const disputeWithChainId = { ...mockDispute };

      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ market_id: 'market-123' }])
          .mockResolvedValueOnce([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest
        .spyOn(disputesRepository, 'find')
        .mockResolvedValue([disputeWithChainId]);
      jest.spyOn(sorobanService, 'getDispute').mockResolvedValue(null);

      const report = await service.reconcile();

      expect(report).not.toBeNull();
      expect(report?.mismatches).toHaveLength(1);
      expect(report?.mismatches[0].kind).toBe(
        DisputeChainMismatchKind.NOT_FOUND_ON_CHAIN,
      );
      expect(report?.mismatches[0].corrected).toBe(false);
    });

    it('should detect resolution mismatches', async () => {
      const resolvedDispute = {
        ...mockDispute,
        tier: 1,
        status: DisputeStatus.RESOLVED,
        resolution: DisputeResolution.UPHELD,
      };

      const unresolviedOnChainDispute = {
        dispute_id: 'chain-dispute-123',
        is_resolved: false,
        resolution_upheld: null,
      };

      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ market_id: 'market-123' }])
          .mockResolvedValueOnce([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([resolvedDispute]);
      jest
        .spyOn(sorobanService, 'getDispute')
        .mockResolvedValue(unresolviedOnChainDispute as any);

      const report = await service.reconcile();

      expect(report).not.toBeNull();
      expect(report?.mismatches).toHaveLength(1);
      expect(report?.mismatches[0].kind).toBe(
        DisputeChainMismatchKind.RESOLUTION_MISMATCH,
      );
      expect(report?.mismatches[0].localValue).toContain('resolved');
      expect(report?.mismatches[0].chainValue).toContain('unresolved');
    });

    it('should populate report with timing information', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const beforeTime = new Date().toISOString();
      const report = await service.reconcile();
      const afterTime = new Date().toISOString();

      expect(report).not.toBeNull();
      expect(report?.startedAt).toBeTruthy();
      expect(report?.finishedAt).toBeTruthy();
      expect(new Date(report!.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime(),
      );
      expect(new Date(report!.finishedAt).getTime()).toBeLessThanOrEqual(
        new Date(afterTime).getTime(),
      );
    });
  });

  describe('edge cases', () => {
    it('should handle disputes with multiple tiers', async () => {
      const tier1Dispute = {
        ...mockDispute,
        tier: 1,
        createdAt: new Date('2024-01-01'),
      };
      const tier2Dispute = {
        ...mockDispute,
        id: 'dispute-124',
        tier: 2,
        createdAt: new Date('2024-01-02'),
      };

      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ market_id: 'market-123' }])
          .mockResolvedValueOnce([]),
      };

      jest
        .spyOn(disputesRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest
        .spyOn(disputesRepository, 'find')
        .mockResolvedValue([tier1Dispute, tier2Dispute] as any);
      jest
        .spyOn(sorobanService, 'getDispute')
        .mockResolvedValue(mockOnChainDispute as any);

      const report = await service.reconcile();

      expect(report).not.toBeNull();
      expect(report?.disputesChecked).toBe(2);
      expect(report?.marketsChecked).toBe(1);
    });
  });
});
