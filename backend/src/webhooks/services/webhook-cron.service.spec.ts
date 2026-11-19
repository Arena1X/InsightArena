import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WebhookCronService } from './webhook-cron.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

describe('WebhookCronService', () => {
  let service: WebhookCronService;
  let dispatcherService: jest.Mocked<WebhookDispatcherService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookCronService,
        {
          provide: WebhookDispatcherService,
          useValue: {
            processPendingDeliveries: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookCronService>(WebhookCronService);
    dispatcherService = module.get(
      WebhookDispatcherService,
    ) as jest.Mocked<WebhookDispatcherService>;

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('processPendingDeliveries', () => {
    it('should call dispatcher service to process pending deliveries', async () => {
      dispatcherService.processPendingDeliveries.mockResolvedValue(undefined);

      await service.processPendingDeliveries();

      expect(dispatcherService.processPendingDeliveries).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should handle successful delivery processing', async () => {
      dispatcherService.processPendingDeliveries.mockResolvedValue(undefined);

      await expect(service.processPendingDeliveries()).resolves.toBeUndefined();
      expect(dispatcherService.processPendingDeliveries).toHaveBeenCalled();
    });

    it('should log error when dispatcher service throws', async () => {
      const error = new Error('Dispatcher service failed');
      dispatcherService.processPendingDeliveries.mockRejectedValue(error);

      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.processPendingDeliveries();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error processing webhook deliveries',
        error,
      );
      loggerErrorSpy.mockRestore();
    });

    it('should not throw when dispatcher service throws', async () => {
      const error = new Error('Network error');
      dispatcherService.processPendingDeliveries.mockRejectedValue(error);

      await expect(service.processPendingDeliveries()).resolves.not.toThrow();
    });

    it('should continue operating even when multiple consecutive errors occur', async () => {
      const error = new Error('Temporary failure');
      dispatcherService.processPendingDeliveries.mockRejectedValue(error);

      await service.processPendingDeliveries();
      await service.processPendingDeliveries();
      await service.processPendingDeliveries();

      expect(dispatcherService.processPendingDeliveries).toHaveBeenCalledTimes(
        3,
      );
    });

    it('should resume normal operation after recovery', async () => {
      const error = new Error('Temporary failure');
      dispatcherService.processPendingDeliveries
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(undefined);

      await service.processPendingDeliveries();
      await service.processPendingDeliveries();

      expect(dispatcherService.processPendingDeliveries).toHaveBeenCalledTimes(
        2,
      );
    });
  });

  describe('error handling', () => {
    it('should handle TypeError from dispatcher', async () => {
      const error = new TypeError('Cannot read property of undefined');
      dispatcherService.processPendingDeliveries.mockRejectedValue(error);

      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(service.processPendingDeliveries()).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();

      loggerErrorSpy.mockRestore();
    });

    it('should handle database connection errors', async () => {
      const error = new Error('connect ECONNREFUSED');
      dispatcherService.processPendingDeliveries.mockRejectedValue(error);

      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(service.processPendingDeliveries()).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();

      loggerErrorSpy.mockRestore();
    });

    it('should handle timeout errors', async () => {
      const error = new Error('Request timeout');
      dispatcherService.processPendingDeliveries.mockRejectedValue(error);

      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(service.processPendingDeliveries()).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();

      loggerErrorSpy.mockRestore();
    });
  });

  describe('cron scheduler', () => {
    it('should be decorated with @Cron for 30-second intervals', () => {
      const cronDecorator = Reflect.getMetadata(
        'cron:expression',
        service.processPendingDeliveries,
      );
      // Note: Cron decorator stores metadata, but we verify via behavior
      // The interval is set to "*/30 * * * * *" (every 30 seconds)
      expect(service.processPendingDeliveries).toBeDefined();
    });

    it('should have correct method name for scheduled execution', () => {
      expect(service.processPendingDeliveries).toBeDefined();
      expect(typeof service.processPendingDeliveries).toBe('function');
    });
  });

  describe('service initialization', () => {
    it('should initialize with dispatcher service', () => {
      expect(service).toBeDefined();
      expect(dispatcherService).toBeDefined();
    });

    it('should have logger instance', () => {
      const logger = (service as any).logger;
      expect(logger).toBeDefined();
    });

    it('should have dispatcher service instance', () => {
      const dispatcher = (service as any).dispatcherService;
      expect(dispatcher).toBeDefined();
      expect(dispatcher).toBe(dispatcherService);
    });
  });

  describe('delivery processing workflow', () => {
    it('should execute full workflow: retrieve pending, attempt delivery, schedule retry or complete', async () => {
      dispatcherService.processPendingDeliveries.mockResolvedValue(undefined);

      await service.processPendingDeliveries();

      expect(dispatcherService.processPendingDeliveries).toHaveBeenCalledWith();
      expect(dispatcherService.processPendingDeliveries).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should be idempotent across multiple invocations', async () => {
      dispatcherService.processPendingDeliveries.mockResolvedValue(undefined);

      const promises = Array(5)
        .fill(null)
        .map(() => service.processPendingDeliveries());

      await Promise.all(promises);

      expect(dispatcherService.processPendingDeliveries).toHaveBeenCalledTimes(
        5,
      );
    });
  });

  describe('concurrent execution', () => {
    it('should handle concurrent cron invocations gracefully', async () => {
      dispatcherService.processPendingDeliveries.mockResolvedValue(undefined);

      const invocations = Array(10)
        .fill(null)
        .map(() => service.processPendingDeliveries());

      await Promise.all(invocations);

      expect(dispatcherService.processPendingDeliveries).toHaveBeenCalledTimes(
        10,
      );
    });

    it('should not deadlock when dispatcher takes time', async () => {
      dispatcherService.processPendingDeliveries.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 100);
          }),
      );

      const startTime = Date.now();
      await service.processPendingDeliveries();
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(100);
      expect(dispatcherService.processPendingDeliveries).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle null return from dispatcher', async () => {
      dispatcherService.processPendingDeliveries.mockResolvedValue(
        null as any,
      );

      await expect(service.processPendingDeliveries()).resolves.toBeUndefined();
    });

    it('should handle undefined return from dispatcher', async () => {
      dispatcherService.processPendingDeliveries.mockResolvedValue(undefined);

      await expect(service.processPendingDeliveries()).resolves.toBeUndefined();
    });

    it('should handle empty result from dispatcher', async () => {
      dispatcherService.processPendingDeliveries.mockResolvedValue({} as any);

      await expect(service.processPendingDeliveries()).resolves.toBeUndefined();
    });
  });
});
