import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import {
  AccountExportCleanupScheduler,
  EXPORT_CLEANUP_JOB_NAME,
} from './account-export-cleanup.scheduler';
import { AccountService } from './account.service';

describe('AccountExportCleanupScheduler', () => {
  let scheduler: AccountExportCleanupScheduler;
  let accountService: jest.Mocked<AccountService>;
  let schedulerRegistry: jest.Mocked<SchedulerRegistry>;
  let configService: jest.Mocked<ConfigService>;
  let mockCronJob: jest.Mocked<CronJob>;

  const mockCleanupResult = {
    expired: 5,
    failed: 2,
    stuck: 1,
    orphans: 3,
  };

  beforeEach(async () => {
    mockCronJob = {
      start: jest.fn(),
      stop: jest.fn(),
      nextDate: jest.fn(),
      lastDate: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountExportCleanupScheduler,
        {
          provide: AccountService,
          useValue: {
            cleanupExports: jest.fn(),
          },
        },
        {
          provide: SchedulerRegistry,
          useValue: {
            addCronJob: jest.fn(),
            deleteCronJob: jest.fn(),
            doesExist: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    scheduler = module.get<AccountExportCleanupScheduler>(
      AccountExportCleanupScheduler,
    );
    accountService = module.get(AccountService) as jest.Mocked<AccountService>;
    schedulerRegistry = module.get(
      SchedulerRegistry,
    ) as jest.Mocked<SchedulerRegistry>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;

    // Default config behavior
    (configService.get as jest.Mock).mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'EXPORT_CLEANUP_ENABLED') return 'true';
      if (key === 'EXPORT_CLEANUP_CRON') return '0 * * * *';
      return defaultValue;
    });

    // Mock Logger to suppress output
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    // Mock CronJob constructor
    (global as any).CronJob = jest.fn(() => mockCronJob);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize scheduler when enabled', () => {
      scheduler.onModuleInit();

      expect(configService.get).toHaveBeenCalledWith(
        'EXPORT_CLEANUP_ENABLED',
        'true',
      );
      expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
        EXPORT_CLEANUP_JOB_NAME,
        mockCronJob,
      );
      expect(mockCronJob.start).toHaveBeenCalled();
    });

    it('should use default cron expression when not configured', () => {
      (configService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue?: string) => {
          if (key === 'EXPORT_CLEANUP_CRON') return defaultValue;
          return 'true';
        },
      );

      scheduler.onModuleInit();

      expect(configService.get).toHaveBeenCalledWith(
        'EXPORT_CLEANUP_CRON',
        '0 * * * *',
      );
    });

    it('should use configured cron expression', () => {
      (configService.get as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === 'EXPORT_CLEANUP_CRON') return '0 0 * * *';
          return 'true';
        },
      );

      scheduler.onModuleInit();

      expect(configService.get).toHaveBeenCalledWith(
        'EXPORT_CLEANUP_CRON',
        '0 * * * *',
      );
    });

    it('should not initialize when disabled with "false"', () => {
      (configService.get as jest.Mock).mockReturnValue('false');

      scheduler.onModuleInit();

      expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();
      expect(mockCronJob.start).not.toHaveBeenCalled();
    });

    it('should not initialize when disabled with case variations', () => {
      (configService.get as jest.Mock).mockReturnValue('FALSE');

      scheduler.onModuleInit();

      expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });

    it('should log initialization message when enabled', () => {
      const loggerLogSpy = jest.spyOn(Logger.prototype, 'log');

      scheduler.onModuleInit();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Account export cleanup scheduled'),
      );

      loggerLogSpy.mockRestore();
    });

    it('should log disabled message when not enabled', () => {
      (configService.get as jest.Mock).mockReturnValue('false');
      const loggerLogSpy = jest.spyOn(Logger.prototype, 'log');

      scheduler.onModuleInit();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Account export cleanup is disabled',
      );

      loggerLogSpy.mockRestore();
    });
  });

  describe('onModuleDestroy', () => {
    it('should remove cron job when it exists', () => {
      (schedulerRegistry.doesExist as jest.Mock).mockReturnValue(true);

      scheduler.onModuleDestroy();

      expect(schedulerRegistry.doesExist).toHaveBeenCalledWith(
        'cron',
        EXPORT_CLEANUP_JOB_NAME,
      );
      expect(schedulerRegistry.deleteCronJob).toHaveBeenCalledWith(
        EXPORT_CLEANUP_JOB_NAME,
      );
    });

    it('should not attempt deletion when cron job does not exist', () => {
      (schedulerRegistry.doesExist as jest.Mock).mockReturnValue(false);

      scheduler.onModuleDestroy();

      expect(schedulerRegistry.deleteCronJob).not.toHaveBeenCalled();
    });

    it('should check for job existence before deletion', () => {
      (schedulerRegistry.doesExist as jest.Mock).mockReturnValue(true);

      scheduler.onModuleDestroy();

      expect(schedulerRegistry.doesExist).toHaveBeenCalledBefore(
        schedulerRegistry.deleteCronJob as any,
      );
    });
  });

  describe('handleCleanup', () => {
    it('should call account service cleanup method', async () => {
      accountService.cleanupExports.mockResolvedValue(mockCleanupResult);

      await scheduler.handleCleanup();

      expect(accountService.cleanupExports).toHaveBeenCalledTimes(1);
    });

    it('should log cleanup statistics when exports are removed', async () => {
      accountService.cleanupExports.mockResolvedValue(mockCleanupResult);
      const loggerLogSpy = jest.spyOn(Logger.prototype, 'log');

      await scheduler.handleCleanup();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('expired=5'),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed=2'),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('stuck=1'),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('orphans=3'),
      );

      loggerLogSpy.mockRestore();
    });

    it('should not log when no exports are removed', async () => {
      accountService.cleanupExports.mockResolvedValue({
        expired: 0,
        failed: 0,
        stuck: 0,
        orphans: 0,
      });
      const loggerLogSpy = jest.spyOn(Logger.prototype, 'log');

      await scheduler.handleCleanup();

      // Only startup logs, no cleanup stats log
      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Account export cleanup:'),
      );

      loggerLogSpy.mockRestore();
    });

    it('should skip cleanup if already running', async () => {
      (scheduler as any).running = true;
      const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn');

      await scheduler.handleCleanup();

      expect(accountService.cleanupExports).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Previous account export cleanup still running'),
      );

      loggerWarnSpy.mockRestore();
    });

    it('should set running flag during execution', async () => {
      let wasRunning = false;
      accountService.cleanupExports.mockImplementation(async () => {
        wasRunning = (scheduler as any).running;
        return mockCleanupResult;
      });

      await scheduler.handleCleanup();

      expect(wasRunning).toBe(true);
    });

    it('should clear running flag after successful execution', async () => {
      accountService.cleanupExports.mockResolvedValue(mockCleanupResult);

      await scheduler.handleCleanup();

      expect((scheduler as any).running).toBe(false);
    });

    it('should clear running flag after error', async () => {
      accountService.cleanupExports.mockRejectedValue(
        new Error('Cleanup failed'),
      );

      await scheduler.handleCleanup();

      expect((scheduler as any).running).toBe(false);
    });

    it('should log error when cleanup fails', async () => {
      const error = new Error('Cleanup failed');
      accountService.cleanupExports.mockRejectedValue(error);
      const loggerErrorSpy = jest.spyOn(Logger.prototype, 'error');

      await scheduler.handleCleanup();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Account export cleanup failed',
        error,
      );

      loggerErrorSpy.mockRestore();
    });

    it('should handle cleanup failure gracefully', async () => {
      accountService.cleanupExports.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(scheduler.handleCleanup()).resolves.toBeUndefined();
    });

    it('should not throw when cleanup throws', async () => {
      accountService.cleanupExports.mockRejectedValue(new Error('Error'));

      await expect(scheduler.handleCleanup()).resolves.not.toThrow();
    });

    it('should handle partial cleanup results', async () => {
      const partialResult = {
        expired: 10,
        failed: 0,
        stuck: 2,
        orphans: 0,
      };
      accountService.cleanupExports.mockResolvedValue(partialResult);
      const loggerLogSpy = jest.spyOn(Logger.prototype, 'log');

      await scheduler.handleCleanup();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('expired=10'),
      );

      loggerLogSpy.mockRestore();
    });
  });

  describe('concurrent execution prevention', () => {
    it('should prevent overlapping cleanup executions', async () => {
      let resolveFirstCall: () => void;
      accountService.cleanupExports.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFirstCall = () => resolve(mockCleanupResult);
          }),
      );

      // Start first cleanup
      const firstCall = scheduler.handleCleanup();

      // Attempt second cleanup while first is running
      const secondCall = scheduler.handleCleanup();

      expect((scheduler as any).running).toBe(true);

      // Both should resolve without error
      const [first, second] = await Promise.all([firstCall, secondCall]);

      expect(first).toBeUndefined();
      expect(second).toBeUndefined();
    });

    it('should allow cleanup after previous run completes', async () => {
      accountService.cleanupExports.mockResolvedValue(mockCleanupResult);

      await scheduler.handleCleanup();
      expect((scheduler as any).running).toBe(false);

      await scheduler.handleCleanup();

      expect(accountService.cleanupExports).toHaveBeenCalledTimes(2);
    });
  });

  describe('lifecycle integration', () => {
    it('should start scheduler on module init and stop on destroy', () => {
      scheduler.onModuleInit();
      expect(mockCronJob.start).toHaveBeenCalled();

      (schedulerRegistry.doesExist as jest.Mock).mockReturnValue(true);
      scheduler.onModuleDestroy();
      expect(schedulerRegistry.deleteCronJob).toHaveBeenCalled();
    });

    it('should handle destroy before init', () => {
      (schedulerRegistry.doesExist as jest.Mock).mockReturnValue(false);

      scheduler.onModuleDestroy();

      expect(schedulerRegistry.deleteCronJob).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle large cleanup results', async () => {
      const largeResult = {
        expired: 1000,
        failed: 500,
        stuck: 100,
        orphans: 250,
      };
      accountService.cleanupExports.mockResolvedValue(largeResult);
      const loggerLogSpy = jest.spyOn(Logger.prototype, 'log');

      await scheduler.handleCleanup();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('expired=1000'),
      );

      loggerLogSpy.mockRestore();
    });

    it('should handle zero cleanup results', async () => {
      accountService.cleanupExports.mockResolvedValue({
        expired: 0,
        failed: 0,
        stuck: 0,
        orphans: 0,
      });

      await expect(scheduler.handleCleanup()).resolves.toBeUndefined();
    });

    it('should handle various error types', async () => {
      const errors = [
        new Error('Network error'),
        new TypeError('Invalid data'),
        new Error('Permission denied'),
      ];

      for (const error of errors) {
        accountService.cleanupExports.mockRejectedValueOnce(error);
        await expect(scheduler.handleCleanup()).resolves.toBeUndefined();
      }
    });
  });
});
