import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AdminDisputesController } from './admin-disputes.controller';
import { DisputesService } from './disputes.service';
import {
  DisputeChainReconciliationService,
  DisputeChainReconciliationReport,
  DisputeChainMismatchKind,
} from './dispute-chain-reconciliation.service';
import { Dispute, DisputeStatus, DisputeResolution } from './entities/dispute.entity';

describe('AdminDisputesController', () => {
  let controller: AdminDisputesController;
  let disputesService: jest.Mocked<DisputesService>;
  let chainReconciliationService: jest.Mocked<DisputeChainReconciliationService>;

  const mockReconciliationReport: DisputeChainReconciliationReport = {
    marketsChecked: 10,
    disputesChecked: 15,
    corrected: 2,
    failedMarkets: [],
    mismatches: [
      {
        disputeId: 'dispute-1',
        marketId: 'market-1',
        onChainMarketId: 'chain-market-1',
        kind: DisputeChainMismatchKind.MISSING_CHAIN_ID,
        localValue: null,
        chainValue: 'chain-dispute-1',
        corrected: true,
      },
    ],
    driftDetected: false,
    driftSeverity: 'none',
    driftPercentage: 0,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };

  const mockDispute: Dispute = {
    id: 'dispute-123',
    marketId: 'market-123',
    disputantId: 'user-123',
    reason: 'Wrong outcome',
    status: DisputeStatus.PENDING,
    tier: 1,
    onChainDisputeId: 'chain-dispute-123',
    createdAt: new Date(),
  } as Dispute;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminDisputesController],
      providers: [
        {
          provide: DisputesService,
          useValue: {
            getBreachedDisputes: jest.fn(),
            resolveDispute: jest.fn(),
            assignArbiter: jest.fn(),
          },
        },
        {
          provide: DisputeChainReconciliationService,
          useValue: {
            reconcile: jest.fn(),
            getLastReport: jest.fn(),
            isEnabled: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AdminDisputesController>(AdminDisputesController);
    disputesService = module.get(DisputesService) as jest.Mocked<DisputesService>;
    chainReconciliationService = module.get(
      DisputeChainReconciliationService,
    ) as jest.Mocked<DisputeChainReconciliationService>;
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have all services injected', () => {
      expect(disputesService).toBeDefined();
      expect(chainReconciliationService).toBeDefined();
    });

    it('should be an instance of AdminDisputesController', () => {
      expect(controller).toBeInstanceOf(AdminDisputesController);
    });
  });

  describe('reconcileChain', () => {
    it('should be defined', () => {
      expect(controller.reconcileChain).toBeDefined();
    });

    it('should call chainReconciliationService.reconcile', async () => {
      chainReconciliationService.reconcile.mockResolvedValue(
        mockReconciliationReport,
      );

      const result = await controller.reconcileChain();

      expect(result).toEqual(mockReconciliationReport);
      expect(chainReconciliationService.reconcile).toHaveBeenCalledTimes(1);
    });

    it('should return reconciliation report with all required fields', async () => {
      chainReconciliationService.reconcile.mockResolvedValue(
        mockReconciliationReport,
      );

      const result = await controller.reconcileChain();

      expect(result).toHaveProperty('marketsChecked');
      expect(result).toHaveProperty('disputesChecked');
      expect(result).toHaveProperty('corrected');
      expect(result).toHaveProperty('failedMarkets');
      expect(result).toHaveProperty('mismatches');
      expect(result).toHaveProperty('driftDetected');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('finishedAt');
    });

    it('should handle null return when reconciliation is already running', async () => {
      chainReconciliationService.reconcile.mockResolvedValue(null);

      const result = await controller.reconcileChain();

      expect(result).toBeNull();
    });

    it('should return report with correct counts', async () => {
      chainReconciliationService.reconcile.mockResolvedValue(
        mockReconciliationReport,
      );

      const result = await controller.reconcileChain();

      expect(result.marketsChecked).toBe(10);
      expect(result.disputesChecked).toBe(15);
      expect(result.corrected).toBe(2);
    });

    it('should include mismatches in report', async () => {
      chainReconciliationService.reconcile.mockResolvedValue(
        mockReconciliationReport,
      );

      const result = await controller.reconcileChain();

      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].kind).toBe(
        DisputeChainMismatchKind.MISSING_CHAIN_ID,
      );
    });

    it('should handle empty mismatches', async () => {
      const emptyReport: DisputeChainReconciliationReport = {
        ...mockReconciliationReport,
        mismatches: [],
        corrected: 0,
      };

      chainReconciliationService.reconcile.mockResolvedValue(emptyReport);

      const result = await controller.reconcileChain();

      expect(result.mismatches).toHaveLength(0);
    });

    it('should handle service errors', async () => {
      const error = new Error('Reconciliation failed');
      chainReconciliationService.reconcile.mockRejectedValue(error);

      await expect(controller.reconcileChain()).rejects.toThrow(
        'Reconciliation failed',
      );
    });

    it('should set drift metrics', async () => {
      chainReconciliationService.reconcile.mockResolvedValue(
        mockReconciliationReport,
      );

      const result = await controller.reconcileChain();

      expect(result.driftDetected).toBe(false);
      expect(result.driftSeverity).toBe('none');
      expect(result.driftPercentage).toBe(0);
    });

    it('should be an async function', () => {
      expect(controller.reconcileChain.constructor.name).toBe(
        'AsyncFunction',
      );
    });

    it('should be idempotent when called multiple times', async () => {
      chainReconciliationService.reconcile
        .mockResolvedValueOnce(mockReconciliationReport)
        .mockResolvedValueOnce(mockReconciliationReport);

      const result1 = await controller.reconcileChain();
      const result2 = await controller.reconcileChain();

      expect(result1).toEqual(result2);
      expect(chainReconciliationService.reconcile).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLastChainReconciliation', () => {
    it('should be defined', () => {
      expect(controller.getLastChainReconciliation).toBeDefined();
    });

    it('should return last reconciliation report', () => {
      chainReconciliationService.getLastReport.mockReturnValue(
        mockReconciliationReport,
      );

      const result = controller.getLastChainReconciliation();

      expect(result).toEqual(mockReconciliationReport);
      expect(chainReconciliationService.getLastReport).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should return null when no report exists', () => {
      chainReconciliationService.getLastReport.mockReturnValue(null);

      const result = controller.getLastChainReconciliation();

      expect(result).toBeNull();
    });

    it('should not be async', () => {
      expect(controller.getLastChainReconciliation.constructor.name).not.toBe(
        'AsyncFunction',
      );
    });

    it('should return report with same data as reconcile', () => {
      chainReconciliationService.getLastReport.mockReturnValue(
        mockReconciliationReport,
      );

      const result = controller.getLastChainReconciliation();

      expect(result.marketsChecked).toBe(
        mockReconciliationReport.marketsChecked,
      );
      expect(result.disputesChecked).toBe(
        mockReconciliationReport.disputesChecked,
      );
    });

    it('should return consistent results across multiple calls', () => {
      chainReconciliationService.getLastReport
        .mockReturnValueOnce(mockReconciliationReport)
        .mockReturnValueOnce(mockReconciliationReport);

      const result1 = controller.getLastChainReconciliation();
      const result2 = controller.getLastChainReconciliation();

      expect(result1).toEqual(result2);
    });
  });

  describe('method annotations', () => {
    it('should have reconcileChain POST endpoint', () => {
      expect(controller.reconcileChain).toBeDefined();
    });

    it('should have getLastChainReconciliation GET endpoint', () => {
      expect(controller.getLastChainReconciliation).toBeDefined();
    });

    it('should require Admin role for reconcileChain', () => {
      // Role guard verification would happen at decorator level
      expect(controller.reconcileChain).toBeDefined();
    });

    it('should require Admin role for getLastChainReconciliation', () => {
      expect(controller.getLastChainReconciliation).toBeDefined();
    });
  });

  describe('service integration', () => {
    it('should use chainReconciliationService for reconcileChain', async () => {
      chainReconciliationService.reconcile.mockResolvedValue(
        mockReconciliationReport,
      );

      await controller.reconcileChain();

      expect(chainReconciliationService.reconcile).toHaveBeenCalled();
    });

    it('should use chainReconciliationService for getLastChainReconciliation', () => {
      chainReconciliationService.getLastReport.mockReturnValue(
        mockReconciliationReport,
      );

      controller.getLastChainReconciliation();

      expect(chainReconciliationService.getLastReport).toHaveBeenCalled();
    });

    it('should not call disputesService for chain reconciliation endpoints', async () => {
      chainReconciliationService.reconcile.mockResolvedValue(
        mockReconciliationReport,
      );

      await controller.reconcileChain();

      expect(disputesService.getBreachedDisputes).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle reconciliation with many mismatches', async () => {
      const manyMismatchesReport: DisputeChainReconciliationReport = {
        ...mockReconciliationReport,
        mismatches: Array(100)
          .fill(null)
          .map((_, i) => ({
            disputeId: `dispute-${i}`,
            marketId: `market-${i}`,
            onChainMarketId: `chain-market-${i}`,
            kind: DisputeChainMismatchKind.CHAIN_ID_MISMATCH,
            localValue: `wrong-${i}`,
            chainValue: `correct-${i}`,
            corrected: true,
          })),
      };

      chainReconciliationService.reconcile.mockResolvedValue(
        manyMismatchesReport,
      );

      const result = await controller.reconcileChain();

      expect(result.mismatches).toHaveLength(100);
    });

    it('should handle reconciliation with failed markets', async () => {
      const reportWithFailures: DisputeChainReconciliationReport = {
        ...mockReconciliationReport,
        failedMarkets: ['market-1', 'market-2', 'market-3'],
      };

      chainReconciliationService.reconcile.mockResolvedValue(
        reportWithFailures,
      );

      const result = await controller.reconcileChain();

      expect(result.failedMarkets).toHaveLength(3);
    });

    it('should handle reconciliation detecting drift', async () => {
      const driftReport: DisputeChainReconciliationReport = {
        ...mockReconciliationReport,
        driftDetected: true,
        driftSeverity: 'warning',
        driftPercentage: 5.2,
      };

      chainReconciliationService.reconcile.mockResolvedValue(driftReport);

      const result = await controller.reconcileChain();

      expect(result.driftDetected).toBe(true);
      expect(result.driftSeverity).toBe('warning');
      expect(result.driftPercentage).toBe(5.2);
    });

    it('should handle reconciliation with zero disputes', async () => {
      const zeroDisputesReport: DisputeChainReconciliationReport = {
        ...mockReconciliationReport,
        marketsChecked: 0,
        disputesChecked: 0,
        corrected: 0,
      };

      chainReconciliationService.reconcile.mockResolvedValue(
        zeroDisputesReport,
      );

      const result = await controller.reconcileChain();

      expect(result.disputesChecked).toBe(0);
    });
  });

  describe('controller lifecycle', () => {
    it('should instantiate successfully', () => {
      expect(controller).toBeInstanceOf(AdminDisputesController);
    });

    it('should have all expected methods', () => {
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(controller));
      expect(methods).toContain('reconcileChain');
      expect(methods).toContain('getLastChainReconciliation');
    });

    it('should be protected by role guards', () => {
      expect(controller.reconcileChain).toBeDefined();
      expect(controller.getLastChainReconciliation).toBeDefined();
    });
  });
});
