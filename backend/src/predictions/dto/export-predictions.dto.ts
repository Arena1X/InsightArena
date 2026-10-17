import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Hard cap on rows in a single CSV export. Rows are streamed from the
 * database (never buffered as a full result set), and the export stops after
 * this many of the most recent predictions. Use `start_date` / `end_date` to
 * export older history in further date-bounded windows.
 */
export const EXPORT_MAX_ROWS = 50_000;

/** Response header that advertises `EXPORT_MAX_ROWS` to clients. */
export const EXPORT_ROW_CAP_HEADER = 'X-Export-Row-Cap';

export const EXPORT_CSV_HEADER =
  'id,market_title,chosen_outcome,stake_stroops,status,payout_stroops,note,submitted_at\n';

export class ExportPredictionsDto {
  @ApiPropertyOptional({
    description: 'Start date for filtering (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering (ISO 8601)',
    example: '2026-07-28',
  })
  @IsOptional()
  @IsString()
  end_date?: string;
}
