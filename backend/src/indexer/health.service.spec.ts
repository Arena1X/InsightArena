import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IndexerHealthService } from './health.service';
import { IndexerService } from './indexer.service';
import { ReconciliationService } from './reconciliation.service';
import { IndexerAlertSeverity } from './dto/indexer-health.dto';

describe('IndexerHealthService', () => {
  let service: IndexerHealthService;
  let indexerService: jest.Mocked<
    Pick<
      IndexerService,
      | 'getMetrics'
      | 'getEventsProcessedPerMinute'
      | 'getLastSuccessfulSyncTimestamp'
      | 'triggerManualSync'
    >
  >;
  let reconciliationService: jest.Mocked<
    Pick<ReconciliationService, 'getStatus'>
  >;

  beforeEach(async () => {
    indexerService = {
      getMetrics: jest.fn(),
      getEventsProcessedPerMinute: jest.fn(),
      getLastSuccessfulSyncTimestamp: jest.fn(),
      triggerManualSync: jest.fn(),
    };

    reconciliationService = {
      getStatus: jest.fn().mockReturnValue({
        enabled: true,
        is_running: false,
        last_run_at: null,
        last_backfill_count: 0,
        last_reorg_depth: 0,
        last_reorg_rescanned_ledger_count: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerHealthService,
        { provide: IndexerService, useValue: indexerService },
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

    service = module.get<IndexerHealthService>(IndexerHealthService);
  });

  const mockHealthyMetrics = () => {
    indexerService.getMetrics.mockResolvedValue({
      events_per_second: 1.5,
      lag_in_ledgers: 10,
      total_events_processed: 950,
      pending_events: 5,
      failed_events: 2,
      dlq_events: 1,
      last_processed_ledger: 500,
      latest_contract_ledger: 510,
      is_running: false,
      uptime_seconds: 3600,
    });
    indexerService.getEventsProcessedPerMinute.mockReturnValue(12);
    indexerService.getLastSuccessfulSyncTimestamp.mockReturnValue(new Date());
  };

  it('returns healthy status when all metrics are within thresholds', async () => {
    mockHealthyMetrics();

    const health = await service.getHealth();

    expect(health.status).toBe('healthy');
    expect(health.alerts).toHaveLength(0);
    expect(health.metrics.lag_in_ledgers).toBe(10);
    expect(health.metrics.events_processed_per_minute).toBe(12);
  });

  it('triggers lag alert when lag exceeds 100 ledgers', async () => {
    mockHealthyMetrics();
    indexerService.getMetrics.mockResolvedValue({
      events_per_second: 0,
      lag_in_ledgers: 150,
      total_events_processed: 100,
      pending_events: 0,
      failed_events: 0,
      dlq_events: 0,
      last_processed_ledger: 100,
      latest_contract_ledger: 250,
      is_running: false,
      uptime_seconds: 60,
    });

    const health = await service.getHealth();

    expect(health.status).toBe('unhealthy');
    expect(health.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INDEXER_LAG_HIGH',
          severity: IndexerAlertSeverity.Critical,
        }),
      ]),
    );
  });

  it('triggers stale sync alert when no events processed recently', async () => {
    mockHealthyMetrics();
    indexerService.getEventsProcessedPerMinute.mockReturnValue(0);
    indexerService.getLastSuccessfulSyncTimestamp.mockReturnValue(
      new Date(Date.now() - 10 * 60_000),
    );

    const health = await service.getHealth();

    expect(health.status).toBe('degraded');
    expect(health.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INDEXER_STALE' }),
      ]),
    );
  });

  it('exports prometheus metrics in text format', async () => {
    mockHealthyMetrics();

    const output = await service.getPrometheusMetrics();

    expect(output).toContain('indexer_lag_in_ledgers 10');
    expect(output).toContain('# TYPE indexer_is_running gauge');
    expect(output).toContain('indexer_total_events_processed 950');
  });

  it('includes reorg depth and re-scanned ledger count from reconciliation status', async () => {
    mockHealthyMetrics();
    reconciliationService.getStatus.mockReturnValue({
      enabled: true,
      is_running: false,
      last_run_at: null,
      last_backfill_count: 3,
      last_reorg_depth: 12,
      last_reorg_rescanned_ledger_count: 45,
    });

    const health = await service.getHealth();
    expect(health.metrics.last_reorg_depth).toBe(12);
    expect(health.metrics.last_reorg_rescanned_ledger_count).toBe(45);

    const output = await service.getPrometheusMetrics();
    expect(output).toContain('indexer_last_reorg_depth 12');
    expect(output).toContain('indexer_last_reorg_rescanned_ledger_count 45');
  });

  it('triggers manual sync via indexer service', async () => {
    indexerService.triggerManualSync.mockResolvedValue(undefined);

    const result = await service.triggerManualSync();

    expect(indexerService.triggerManualSync).toHaveBeenCalled();
    expect(result.message).toContain('triggered');
  });
});
