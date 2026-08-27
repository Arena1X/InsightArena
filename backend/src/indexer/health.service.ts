import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IndexerService } from './indexer.service';
import { ReconciliationService } from './reconciliation.service';
import {
  IndexerAlertDto,
  IndexerAlertSeverity,
  IndexerDashboardDto,
  IndexerHealthMetricsDto,
  IndexerHealthResponseDto,
} from './dto/indexer-health.dto';

const LAG_ALERT_THRESHOLD = 100;
const STALE_SYNC_MINUTES = 5;
const ERROR_RATE_THRESHOLD = 5;

@Injectable()
export class IndexerHealthService {
  private readonly logger = new Logger(IndexerHealthService.name);

  constructor(
    private readonly indexerService: IndexerService,
    private readonly configService: ConfigService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  async getHealth(): Promise<IndexerHealthResponseDto> {
    const metrics = await this.buildMetrics();
    const alerts = this.evaluateAlerts(metrics);

    return {
      status: this.resolveStatus(alerts),
      metrics,
      alerts,
    };
  }

  async getDashboard(): Promise<IndexerDashboardDto> {
    const health = await this.getHealth();
    const baseMetrics = await this.indexerService.getMetrics();
    const contractId = this.configService.get<string>('SOROBAN_CONTRACT_ID');

    return {
      ...health,
      events_per_second: baseMetrics.events_per_second,
      sync_interval_seconds: 30,
      contract_configured: Boolean(
        contractId && contractId !== 'your-contract-id-here',
      ),
    };
  }

  async getPrometheusMetrics(): Promise<string> {
    const metrics = await this.buildMetrics();
    const lines = [
      '# HELP indexer_last_processed_ledger Last ledger processed by the indexer',
      '# TYPE indexer_last_processed_ledger gauge',
      `indexer_last_processed_ledger ${metrics.last_processed_ledger}`,
      '# HELP indexer_current_stellar_ledger Current Stellar network ledger',
      '# TYPE indexer_current_stellar_ledger gauge',
      `indexer_current_stellar_ledger ${metrics.current_stellar_ledger}`,
      '# HELP indexer_lag_in_ledgers Ledger lag behind the network',
      '# TYPE indexer_lag_in_ledgers gauge',
      `indexer_lag_in_ledgers ${metrics.lag_in_ledgers}`,
      '# HELP indexer_events_processed_per_minute Events processed in the last minute',
      '# TYPE indexer_events_processed_per_minute gauge',
      `indexer_events_processed_per_minute ${metrics.events_processed_per_minute}`,
      '# HELP indexer_failed_event_count Total failed contract events',
      '# TYPE indexer_failed_event_count gauge',
      `indexer_failed_event_count ${metrics.failed_event_count}`,
      '# HELP indexer_error_rate_percent Failed events as a percentage of total',
      '# TYPE indexer_error_rate_percent gauge',
      `indexer_error_rate_percent ${metrics.error_rate_percent}`,
      '# HELP indexer_is_running Whether the indexer poll is currently running',
      '# TYPE indexer_is_running gauge',
      `indexer_is_running ${metrics.is_running ? 1 : 0}`,
      '# HELP indexer_uptime_seconds Indexer process uptime in seconds',
      '# TYPE indexer_uptime_seconds counter',
      `indexer_uptime_seconds ${metrics.uptime_seconds}`,
      '# HELP indexer_total_events_processed Total successfully processed events',
      '# TYPE indexer_total_events_processed counter',
      `indexer_total_events_processed ${metrics.total_events_processed}`,
      '# HELP indexer_pending_events Pending events awaiting processing',
      '# TYPE indexer_pending_events gauge',
      `indexer_pending_events ${metrics.pending_events}`,
      '# HELP indexer_dlq_events Events in the dead-letter queue',
      '# TYPE indexer_dlq_events gauge',
      `indexer_dlq_events ${metrics.dlq_events}`,
      '# HELP indexer_last_reorg_depth Ledgers rewound by the most recently detected chain reorg',
      '# TYPE indexer_last_reorg_depth gauge',
      `indexer_last_reorg_depth ${metrics.last_reorg_depth}`,
      '# HELP indexer_last_reorg_rescanned_ledger_count Ledgers re-scanned recovering from the most recently detected chain reorg',
      '# TYPE indexer_last_reorg_rescanned_ledger_count gauge',
      `indexer_last_reorg_rescanned_ledger_count ${metrics.last_reorg_rescanned_ledger_count}`,
    ];

    return `${lines.join('\n')}\n`;
  }

  async triggerManualSync(): Promise<{ message: string }> {
    this.logger.log('Manual indexer sync triggered');
    await this.indexerService.triggerManualSync();
    return { message: 'Indexer sync triggered successfully' };
  }

  private async buildMetrics(): Promise<IndexerHealthMetricsDto> {
    const baseMetrics = await this.indexerService.getMetrics();
    const eventsProcessedPerMinute =
      this.indexerService.getEventsProcessedPerMinute();
    const lastSyncAt = this.indexerService.getLastSuccessfulSyncTimestamp();

    const totalAttempts =
      baseMetrics.total_events_processed +
      baseMetrics.failed_events +
      baseMetrics.dlq_events;
    const errorRate =
      totalAttempts > 0
        ? Math.round(
            ((baseMetrics.failed_events + baseMetrics.dlq_events) /
              totalAttempts) *
              10000,
          ) / 100
        : 0;

    return {
      last_processed_ledger: baseMetrics.last_processed_ledger,
      current_stellar_ledger: baseMetrics.latest_contract_ledger,
      lag_in_ledgers: baseMetrics.lag_in_ledgers,
      events_processed_per_minute: eventsProcessedPerMinute,
      failed_event_count: baseMetrics.failed_events + baseMetrics.dlq_events,
      error_rate_percent: errorRate,
      last_successful_sync_at: lastSyncAt.toISOString(),
      is_running: baseMetrics.is_running,
      uptime_seconds: baseMetrics.uptime_seconds,
      total_events_processed: baseMetrics.total_events_processed,
      pending_events: baseMetrics.pending_events,
      dlq_events: baseMetrics.dlq_events,
      last_reorg_depth: this.reconciliationService.getStatus().last_reorg_depth,
      last_reorg_rescanned_ledger_count:
        this.reconciliationService.getStatus()
          .last_reorg_rescanned_ledger_count,
    };
  }

  private evaluateAlerts(metrics: IndexerHealthMetricsDto): IndexerAlertDto[] {
    const alerts: IndexerAlertDto[] = [];
    const now = new Date().toISOString();

    if (metrics.lag_in_ledgers > LAG_ALERT_THRESHOLD) {
      alerts.push({
        severity: IndexerAlertSeverity.Critical,
        code: 'INDEXER_LAG_HIGH',
        message: `Indexer lag is ${metrics.lag_in_ledgers} ledgers (threshold: ${LAG_ALERT_THRESHOLD})`,
        triggered_at: now,
      });
    }

    const minutesSinceSync =
      (Date.now() - new Date(metrics.last_successful_sync_at).getTime()) /
      60000;

    if (
      metrics.events_processed_per_minute === 0 &&
      minutesSinceSync >= STALE_SYNC_MINUTES
    ) {
      alerts.push({
        severity: IndexerAlertSeverity.Warning,
        code: 'INDEXER_STALE',
        message: `No events processed in the last ${STALE_SYNC_MINUTES} minutes`,
        triggered_at: now,
      });
    }

    if (metrics.error_rate_percent > ERROR_RATE_THRESHOLD) {
      alerts.push({
        severity: IndexerAlertSeverity.Critical,
        code: 'INDEXER_ERROR_RATE_HIGH',
        message: `Indexer error rate is ${metrics.error_rate_percent}% (threshold: ${ERROR_RATE_THRESHOLD}%)`,
        triggered_at: now,
      });
    }

    return alerts;
  }

  private resolveStatus(
    alerts: IndexerAlertDto[],
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (
      alerts.some((alert) => alert.severity === IndexerAlertSeverity.Critical)
    ) {
      return 'unhealthy';
    }

    if (alerts.length > 0) {
      return 'degraded';
    }

    return 'healthy';
  }
}
