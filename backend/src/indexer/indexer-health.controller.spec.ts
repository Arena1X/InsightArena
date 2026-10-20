import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IndexerHealthController } from './indexer-health.controller';
import { IndexerHealthService } from './health.service';
import { ReconciliationService } from './reconciliation.service';

describe('IndexerHealthController', () => {
  let controller: IndexerHealthController;
  let healthService: jest.Mocked<
    Pick<
      IndexerHealthService,
      | 'getHealth'
      | 'getDashboard'
      | 'getPrometheusMetrics'
      | 'triggerManualSync'
    >
  >;
  let reconciliationService: jest.Mocked<
    Pick<ReconciliationService, 'getStatus' | 'getCheckpointForContract'>
  >;

  beforeEach(async () => {
    healthService = {
      getHealth: jest.fn(),
      getDashboard: jest.fn(),
      getPrometheusMetrics: jest.fn(),
      triggerManualSync: jest.fn(),
    };

    reconciliationService = {
      getStatus: jest.fn().mockReturnValue({
        enabled: true,
        is_running: false,
        last_run_at: null,
        last_backfill_count: 0,
      }),
      getCheckpointForContract: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IndexerHealthController],
      providers: [
        { provide: IndexerHealthService, useValue: healthService },
        { provide: ReconciliationService, useValue: reconciliationService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SOROBAN_CONTRACT_ID') return 'contract-123';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<IndexerHealthController>(IndexerHealthController);
  });

  it('returns health status', async () => {
    healthService.getHealth.mockResolvedValue({
      status: 'healthy',
      metrics: {} as any,
      alerts: [],
    });

    const result = await controller.getHealth();
    expect(result.status).toBe('healthy');
  });

  it('returns prometheus metrics as plain text', async () => {
    healthService.getPrometheusMetrics.mockResolvedValue(
      'indexer_lag_in_ledgers 0\n',
    );

    const result = await controller.getPrometheusMetrics();
    expect(result).toContain('indexer_lag_in_ledgers');
  });
});
