import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { FxRateService, BASE_CURRENCY } from './fx-rate.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FxRateService', () => {
  let service: FxRateService;
  let cacheManager: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    cacheManager = { get: jest.fn(), set: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxRateService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'https://fake-fx-api.test') },
        },
      ],
    }).compile();

    service = module.get(FxRateService);
  });

  describe('getRates', () => {
    it('returns cached rates without fetching', async () => {
      const cached = {
        base: BASE_CURRENCY,
        rates: { USD: 0.1 },
        fetched_at: '',
      };
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getRates();

      expect(result).toBe(cached);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('fetches, caches, and returns rates on cache miss', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockedAxios.get.mockResolvedValue({
        data: { rates: { USD: 0.1, EUR: 0.09 } },
      });

      const result = await service.getRates();

      expect(result.rates).toEqual({ USD: 0.1, EUR: 0.09 });
      expect(cacheManager.set).toHaveBeenCalledWith(
        'fx:rates',
        expect.objectContaining({ rates: { USD: 0.1, EUR: 0.09 } }),
        300000,
      );
    });

    it('falls back to empty rates on fetch error', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockedAxios.get.mockRejectedValue(new Error('network error'));

      const result = await service.getRates();

      expect(result.rates).toEqual({});
      expect(result.base).toBe(BASE_CURRENCY);
    });
  });

  describe('convert', () => {
    it('returns XLM when no currency specified', async () => {
      const result = await service.convert(10_000_000);
      expect(result).toEqual({ amount: 1, currency: BASE_CURRENCY });
    });

    it('converts stroops to requested currency', async () => {
      cacheManager.get.mockResolvedValue({
        base: BASE_CURRENCY,
        rates: { USD: 0.12 },
        fetched_at: '',
      });

      const result = await service.convert(10_000_000, 'USD');
      expect(result).toEqual({ amount: 0.12, currency: 'USD' });
    });

    it('falls back to base currency when rate is missing', async () => {
      cacheManager.get.mockResolvedValue({
        base: BASE_CURRENCY,
        rates: {},
        fetched_at: '',
      });

      const result = await service.convert(10_000_000, 'JPY');
      expect(result).toEqual({ amount: 1, currency: BASE_CURRENCY });
    });
  });
});
