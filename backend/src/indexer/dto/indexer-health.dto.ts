import { ApiProperty } from '@nestjs/swagger';

export enum IndexerAlertSeverity {
  Warning = 'warning',
  Critical = 'critical',
}

export class IndexerAlertDto {
  @ApiProperty({ enum: IndexerAlertSeverity })
  severity: IndexerAlertSeverity;

  @ApiProperty()
  code: string;

  @ApiProperty()
  message: string;

  @ApiProperty()
  triggered_at: string;
}

export class IndexerHealthMetricsDto {
  @ApiProperty()
  last_processed_ledger: number;

  @ApiProperty()
  current_stellar_ledger: number;

  @ApiProperty()
  lag_in_ledgers: number;

  @ApiProperty()
  events_processed_per_minute: number;

  @ApiProperty()
  failed_event_count: number;

  @ApiProperty()
  error_rate_percent: number;

  @ApiProperty()
  last_successful_sync_at: string;

  @ApiProperty()
  is_running: boolean;

  @ApiProperty()
  uptime_seconds: number;

  @ApiProperty()
  total_events_processed: number;

  @ApiProperty()
  pending_events: number;

  @ApiProperty()
  dlq_events: number;

  @ApiProperty({
    description:
      'Ledgers rewound by the most recently detected chain reorg (0 if none yet)',
  })
  last_reorg_depth: number;

  @ApiProperty({
    description:
      'Ledgers re-scanned during recovery from the most recently detected chain reorg (0 if none yet)',
  })
  last_reorg_rescanned_ledger_count: number;
}

export class IndexerHealthResponseDto {
  @ApiProperty()
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({ type: IndexerHealthMetricsDto })
  metrics: IndexerHealthMetricsDto;

  @ApiProperty({ type: [IndexerAlertDto] })
  alerts: IndexerAlertDto[];
}

export class ReconciliationStatusDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  is_running: boolean;

  @ApiProperty({ nullable: true })
  last_run_at: string | null;

  @ApiProperty()
  last_backfill_count: number;

  @ApiProperty()
  last_reorg_depth: number;

  @ApiProperty()
  last_reorg_rescanned_ledger_count: number;

  @ApiProperty()
  lag_in_ledgers: number;
}

export class IndexerDashboardDto extends IndexerHealthResponseDto {
  @ApiProperty()
  events_per_second: number;

  @ApiProperty()
  sync_interval_seconds: number;

  @ApiProperty()
  contract_configured: boolean;
}
