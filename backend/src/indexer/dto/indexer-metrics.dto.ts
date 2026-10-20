import { ApiProperty } from '@nestjs/swagger';

export class IndexerMetricsDto {
  @ApiProperty()
  events_per_second: number;

  @ApiProperty()
  lag_in_ledgers: number;

  @ApiProperty()
  total_events_processed: number;

  @ApiProperty()
  pending_events: number;

  @ApiProperty()
  failed_events: number;

  @ApiProperty()
  dlq_events: number;

  @ApiProperty()
  last_processed_ledger: number;

  @ApiProperty()
  latest_contract_ledger: number;

  @ApiProperty()
  is_running: boolean;

  @ApiProperty()
  uptime_seconds: number;
}
