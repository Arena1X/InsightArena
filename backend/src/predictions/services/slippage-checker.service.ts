import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SlippageExceededException } from '../exceptions/slippage-exceeded.exception';
import { InsufficientLiquidityException } from '../exceptions/insufficient-liquidity.exception';

/**
 * Minimum number of shares (in stroops) a fill must yield for the market to
 * be considered liquid enough to price a prediction.
 *
 * The boundary is inclusive: a fill of exactly this many shares passes, while
 * anything below it (e.g. the `0` shares a contract returns for an empty /
 * zero-liquidity outcome pool) is rejected with
 * `InsufficientLiquidityException` instead of being compared against the
 * user's slippage bounds. A realized price of `0` (or below) is likewise
 * treated as an unpriceable, zero-liquidity fill.
 */
export const MIN_LIQUIDITY_SHARES_STROOPS = 1n;

/** Global fallback tolerance (bps) for markets without an override. 0 = exact bounds. */
export const DEFAULT_SLIPPAGE_TOLERANCE_BPS = 0;
/** Upper bound (bps) accepted for any configured tolerance (50%). */
export const MAX_SLIPPAGE_TOLERANCE_BPS = 5000;

/** Parse an integer stroop string, returning null for anything malformed. */
function parseStroops(value: string): bigint | null {
  if (!/^-?\d+$/.test(value.trim())) {
    return null;
  }
  return BigInt(value.trim());
}

@Injectable()
export class SlippageCheckerService {
  private readonly logger = new Logger(SlippageCheckerService.name);

  /**
   * Check slippage tolerance for prediction execution.
   * Throws InsufficientLiquidityException if the fill indicates the market
   * had no usable liquidity (see `MIN_LIQUIDITY_SHARES_STROOPS`), and
   * SlippageExceededException if bounds are violated.
   *
   * @param maxPrice Maximum acceptable price per share (optional)
   * @param minSharesOut Minimum acceptable shares received (optional)
   * @param actualPrice Realized price from contract
   * @param actualShares Realized shares from contract
   * @param marketToleranceBps Per-market tolerance in bps; falls back to the global default
   */
  checkSlippage(
    maxPrice: string | undefined,
    minSharesOut: string | undefined,
    actualPrice: string,
    actualShares: string,
    marketToleranceBps?: number | null,
  ): void {
    this.assertSufficientLiquidity(actualPrice, actualShares);
    const tolerance = BigInt(this.getEffectiveTolerance(marketToleranceBps));

    if (maxPrice) {
      // Tolerance widens the user's price bound: allow up to +tolerance bps.
      const maxPriceBigInt = (BigInt(maxPrice) * (10000n + tolerance)) / 10000n;
      const actualPriceBigInt = BigInt(actualPrice);

      if (actualPriceBigInt > maxPriceBigInt) {
        this.logger.warn(
          `Price slippage exceeded: actual=${actualPrice} > max=${maxPrice}`,
        );
        throw new SlippageExceededException(
          maxPrice,
          actualPrice,
          minSharesOut || '0',
          actualShares,
        );
      }
    }

    if (minSharesOut) {
      // Tolerance widens the user's shares bound: allow down to -tolerance bps.
      const minSharesBigInt =
        (BigInt(minSharesOut) * (10000n - tolerance)) / 10000n;
      const actualSharesBigInt = BigInt(actualShares);

      if (actualSharesBigInt < minSharesBigInt) {
        this.logger.warn(
          `Shares slippage exceeded: actual=${actualShares} < min=${minSharesOut}`,
        );
        throw new SlippageExceededException(
          maxPrice || '0',
          actualPrice,
          minSharesOut,
          actualShares,
        );
      }
    }

    this.logger.debug(
      `Slippage check passed: price=${actualPrice} shares=${actualShares}`,
    );
  }

  /** Effective tolerance (bps): the market override, else the global default. */
  getEffectiveTolerance(marketToleranceBps?: number | null): number {
    const bps = marketToleranceBps ?? DEFAULT_SLIPPAGE_TOLERANCE_BPS;
    if (
      !Number.isInteger(bps) ||
      bps < 0 ||
      bps > MAX_SLIPPAGE_TOLERANCE_BPS
    ) {
      throw new BadRequestException(
        `Slippage tolerance must be an integer between 0 and ${MAX_SLIPPAGE_TOLERANCE_BPS} bps`,
      );
    }
    return bps;
  }

  /**
   * Reject fills that come from a zero / near-zero liquidity market rather
   * than letting them produce a meaningless (NaN/Infinity-like) slippage
   * result. Malformed contract values are treated the same way.
   */
  assertSufficientLiquidity(actualPrice: string, actualShares: string): void {
    const price = parseStroops(actualPrice);
    const shares = parseStroops(actualShares);

    if (
      price === null ||
      shares === null ||
      price <= 0n ||
      shares < MIN_LIQUIDITY_SHARES_STROOPS
    ) {
      this.logger.warn(
        `Insufficient liquidity: price=${actualPrice} shares=${actualShares} min_shares=${MIN_LIQUIDITY_SHARES_STROOPS}`,
      );
      throw new InsufficientLiquidityException(
        actualPrice,
        actualShares,
        MIN_LIQUIDITY_SHARES_STROOPS.toString(),
      );
    }
  }
}
