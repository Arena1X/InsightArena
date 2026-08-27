import { IsOptional, IsDateString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PnlQueryDto {
  @ApiPropertyOptional({
    description:
      'Include only predictions submitted on or after this date (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Include only predictions submitted on or before this date (ISO 8601)',
    example: '2025-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'When true the response includes a per-market breakdown alongside the aggregate totals',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  breakdown?: boolean = false;
}

// ──────────────── Response shape ────────────────

export interface MarketPnlEntry {
  market_id: string;
  market_title: string;
  /** Realized P&L in XLM (settled predictions in this market) */
  realized_pnl_xlm: number;
  /** Unrealized P&L in XLM (open positions at current implied odds) */
  unrealized_pnl_xlm: number;
  /** Total staked in this market, in XLM */
  staked_xlm: number;
}

export interface PnlResponseDto {
  /** Total realized P&L across all selected markets, in XLM */
  realized_pnl_xlm: number;
  /** Total unrealized P&L across all selected markets, in XLM */
  unrealized_pnl_xlm: number;
  /** Total staked across all selected markets, in XLM */
  total_staked_xlm: number;
  /** Present only when breakdown=true */
  per_market?: MarketPnlEntry[];
}
