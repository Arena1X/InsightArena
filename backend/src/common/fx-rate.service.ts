import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import axios from 'axios';

export const BASE_CURRENCY = 'XLM';
const CACHE_KEY = 'fx:rates';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface FxRates {
  base: string;
  rates: Record<string, number>;
  fetched_at: string;
}

@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name);
  private readonly apiUrl: string;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>(
      'FX_RATE_API_URL',
      'https://api.exchangerate-api.com/v4/latest/USD',
    );
  }

  /**
   * Returns cached rates, fetching from the configured source if stale.
   * Falls back to { base, rates: {} } on any error so callers can degrade
   * gracefully to the base currency.
   */
  async getRates(): Promise<FxRates> {
    const cached = await this.cacheManager.get<FxRates>(CACHE_KEY);
    if (cached) return cached;

    try {
      const { data } = await axios.get<{ rates: Record<string, number> }>(
        this.apiUrl,
        { timeout: 5000 },
      );
      const rates: FxRates = {
        base: BASE_CURRENCY,
        rates: data.rates ?? {},
        fetched_at: new Date().toISOString(),
      };
      await this.cacheManager.set(CACHE_KEY, rates, CACHE_TTL_MS);
      return rates;
    } catch (err) {
      this.logger.warn(
        `FX rate fetch failed, falling back to base currency: ${err instanceof Error ? err.message : err}`,
      );
      return {
        base: BASE_CURRENCY,
        rates: {},
        fetched_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Converts a stroops amount to the requested currency.
   * Returns the original value in XLM stroops when the currency is unknown
   * or rates are unavailable.
   */
  async convert(
    stroops: string | number,
    currency?: string,
  ): Promise<{ amount: number; currency: string }> {
    const xlm = Number(stroops) / 1e7;

    if (!currency || currency.toUpperCase() === BASE_CURRENCY) {
      return { amount: xlm, currency: BASE_CURRENCY };
    }

    const { rates } = await this.getRates();
    const rate = rates[currency.toUpperCase()];

    if (!rate) {
      this.logger.debug(
        `No rate for ${currency}, falling back to ${BASE_CURRENCY}`,
      );
      return { amount: xlm, currency: BASE_CURRENCY };
    }

    return { amount: xlm * rate, currency: currency.toUpperCase() };
  }
}
