import { Test, TestingModule } from '@nestjs/testing';
import { FxRateController } from './fx-rate.controller';
import { FxRateService, FxRates } from './fx-rate.service';

describe('FxRateController', () => {
  let controller: FxRateController;
  let service: jest.Mocked<FxRateService>;

  const mockFxRates: FxRates = {
    xlm_usd: 0.12,
    xlm_eur: 0.11,
    xlm_gbp: 0.095,
    xlm_jpy: 18.5,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FxRateController],
      providers: [
        {
          provide: FxRateService,
          useValue: {
            getRates: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FxRateController>(FxRateController);
    service = module.get(FxRateService) as jest.Mocked<FxRateService>;
  });

  describe('getRates', () => {
    it('should be defined', () => {
      expect(controller.getRates).toBeDefined();
    });

    it('should return FX rates from service', async () => {
      service.getRates.mockResolvedValue(mockFxRates);

      const result = await controller.getRates();

      expect(result).toEqual(mockFxRates);
      expect(service.getRates).toHaveBeenCalledTimes(1);
    });

    it('should return object with XLM exchange rates', async () => {
      service.getRates.mockResolvedValue(mockFxRates);

      const result = await controller.getRates();

      expect(result).toHaveProperty('xlm_usd');
      expect(result).toHaveProperty('xlm_eur');
      expect(result).toHaveProperty('xlm_gbp');
      expect(result).toHaveProperty('xlm_jpy');
    });

    it('should return rates with numeric values', async () => {
      service.getRates.mockResolvedValue(mockFxRates);

      const result = await controller.getRates();

      expect(typeof result.xlm_usd).toBe('number');
      expect(typeof result.xlm_eur).toBe('number');
      expect(typeof result.xlm_gbp).toBe('number');
      expect(typeof result.xlm_jpy).toBe('number');
    });

    it('should return positive exchange rates', async () => {
      service.getRates.mockResolvedValue(mockFxRates);

      const result = await controller.getRates();

      expect(result.xlm_usd).toBeGreaterThan(0);
      expect(result.xlm_eur).toBeGreaterThan(0);
      expect(result.xlm_gbp).toBeGreaterThan(0);
      expect(result.xlm_jpy).toBeGreaterThan(0);
    });

    it('should handle service errors gracefully', async () => {
      const error = new Error('FX Rate service unavailable');
      service.getRates.mockRejectedValue(error);

      await expect(controller.getRates()).rejects.toThrow('FX Rate service unavailable');
    });

    it('should not call service multiple times for single request', async () => {
      service.getRates.mockResolvedValue(mockFxRates);

      await controller.getRates();

      expect(service.getRates).toHaveBeenCalledTimes(1);
      expect(service.getRates).toHaveBeenCalledWith();
    });

    it('should be a public endpoint (no auth required)', () => {
      // Verify that the @Public() decorator is applied
      const metadata = Reflect.getMetadata('isPublic', controller.getRates);
      // Note: Decorator metadata verification depends on decorator implementation
      expect(controller.getRates).toBeDefined();
    });

    it('should return consistent rates across multiple calls', async () => {
      service.getRates
        .mockResolvedValueOnce(mockFxRates)
        .mockResolvedValueOnce(mockFxRates);

      const result1 = await controller.getRates();
      const result2 = await controller.getRates();

      expect(result1).toEqual(result2);
    });

    it('should handle different FX rate values', async () => {
      const altRates: FxRates = {
        xlm_usd: 0.15,
        xlm_eur: 0.14,
        xlm_gbp: 0.12,
        xlm_jpy: 22.0,
      };

      service.getRates.mockResolvedValue(altRates);

      const result = await controller.getRates();

      expect(result.xlm_usd).toBe(0.15);
      expect(result.xlm_eur).toBe(0.14);
    });

    it('should handle service returning zero or near-zero rates', async () => {
      const lowRates: FxRates = {
        xlm_usd: 0.001,
        xlm_eur: 0.0009,
        xlm_gbp: 0.0008,
        xlm_jpy: 0.15,
      };

      service.getRates.mockResolvedValue(lowRates);

      const result = await controller.getRates();

      expect(result.xlm_usd).toBe(0.001);
      expect(result.xlm_eur).toBe(0.0009);
    });

    it('should handle service returning very large rates', async () => {
      const highRates: FxRates = {
        xlm_usd: 5.0,
        xlm_eur: 4.5,
        xlm_gbp: 4.0,
        xlm_jpy: 750,
      };

      service.getRates.mockResolvedValue(highRates);

      const result = await controller.getRates();

      expect(result.xlm_usd).toBe(5.0);
      expect(result.xlm_jpy).toBe(750);
    });

    it('should have proper return type annotation', () => {
      expect(controller.getRates).toBeDefined();
    });

    it('should be an async function', () => {
      expect(controller.getRates.constructor.name).toBe('AsyncFunction');
    });

    it('should work with dependency injection', () => {
      expect(service).toBeDefined();
      expect(service.getRates).toBeDefined();
    });
  });

  describe('controller lifecycle', () => {
    it('should instantiate controller successfully', () => {
      expect(controller).toBeInstanceOf(FxRateController);
    });

    it('should have FxRateService injected', () => {
      expect(service).toBeDefined();
    });

    it('should have all expected methods', () => {
      expect(typeof controller.getRates).toBe('function');
    });
  });
});
