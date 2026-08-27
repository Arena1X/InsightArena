import { Injectable, Logger } from '@nestjs/common';
import { SlippageExceededException } from '../exceptions/slippage-exceeded.exception';

@Injectable()
export class SlippageCheckerService {
  private readonly logger = new Logger(SlippageCheckerService.name);

  /**
   * Check slippage tolerance for prediction execution.
   * Throws SlippageExceededException if bounds are violated.
   *
   * @param maxPrice Maximum acceptable price per share (optional)
   * @param minSharesOut Minimum acceptable shares received (optional)
   * @param actualPrice Realized price from contract
   * @param actualShares Realized shares from contract
   */
  checkSlippage(
    maxPrice: string | undefined,
    minSharesOut: string | undefined,
    actualPrice: string,
    actualShares: string,
  ): void {
    if (maxPrice) {
      const maxPriceBigInt = BigInt(maxPrice);
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
      const minSharesBigInt = BigInt(minSharesOut);
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
}
