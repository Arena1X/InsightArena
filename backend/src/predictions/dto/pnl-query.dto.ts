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

/*
 * Rounding policy
 * ---------------
 * P&L is computed and accumulated exclusively in integer stroops (bigint), so
 * no rounding drift can build up across many predictions:
 *
 * 1. Each prediction's P&L is rounded once, to a whole stroop. Only the
 *    implied value of an open position involves division; it is truncated
 *    toward zero (bigint division).
 * 2. Per-market and aggregate totals are exact bigint sums of those
 *    per-prediction stroop values, so the per-market `*_stroops` fields always
 *    sum exactly to the aggregate `*_stroops` fields.
 * 3. Every `*_xlm` number is converted once, from its exact stroop total, via
 *    the exact decimal representation (see `stroopsToXlm`). XLM values are
 *    never summed or re-rounded from other XLM values. A zero total is
 *    reported as exactly 0.
 */

export interface MarketPnlEntry {
  market_id: string;
  market_title: string;
  /** Realized P&L in XLM (settled predictions in this market) */
  realized_pnl_xlm: number;
  /** Unrealized P&L in XLM (open positions at current implied odds) */
  unrealized_pnl_xlm: number;
  /** Total staked in this market, in XLM */
  staked_xlm: number;
  /** Exact realized P&L in stroops (signed decimal integer string) */
  realized_pnl_stroops: string;
  /** Exact unrealized P&L in stroops (signed decimal integer string) */
  unrealized_pnl_stroops: string;
  /** Exact total staked in this market, in stroops */
  staked_stroops: string;
}

export interface PnlResponseDto {
  /** Total realized P&L across all selected markets, in XLM */
  realized_pnl_xlm: number;
  /** Total unrealized P&L across all selected markets, in XLM */
  unrealized_pnl_xlm: number;
  /** Total staked across all selected markets, in XLM */
  total_staked_xlm: number;
  /** Exact total realized P&L in stroops (signed decimal integer string) */
  realized_pnl_stroops: string;
  /** Exact total unrealized P&L in stroops (signed decimal integer string) */
  unrealized_pnl_stroops: string;
  /** Exact total staked in stroops */
  total_staked_stroops: string;
  /** Present only when breakdown=true */
  per_market?: MarketPnlEntry[];
}
