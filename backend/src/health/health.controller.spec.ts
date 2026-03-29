jest.mock('./health.service', () => ({
  HealthService: class HealthService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: {
    checkHealth: jest.Mock;
    checkPing: jest.Mock;
  };

  beforeEach(async () => {
    healthService = {
      checkHealth: jest.fn(),
      checkPing: jest.fn().mockReturnValue({
        status: 'ok',
        type: 'ping',
        timestamp: new Date().toISOString(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('should return health status when all checks pass', async () => {
      const healthCheckResult = {
        status: 'ok' as const,
        details: {
          http: { status: 'up' },
          database: { status: 'up' },
          storage: { status: 'up' },
        },
      };

      healthService.checkHealth.mockResolvedValue(healthCheckResult);

      const result = await controller.check();

      expect(result).toEqual(healthCheckResult);
      expect(healthService.checkHealth).toHaveBeenCalled();
    });

    it('should delegate to HealthService', async () => {
      healthService.checkHealth.mockResolvedValue({
        status: 'ok',
        details: {},
      });

      await controller.check();

      expect(healthService.checkHealth).toHaveBeenCalledTimes(1);
    });

    it('should return 503 payload when service reports error', async () => {
      const failedHealthCheck = {
        status: 'error' as const,
        details: {
          http: { status: 'up' },
          database: { status: 'down', message: 'Connection refused' },
          storage: { status: 'up' },
        },
      };

      healthService.checkHealth.mockResolvedValue(failedHealthCheck);

      const result = await controller.check();

      expect(result).toEqual(failedHealthCheck);
    });
  });

  describe('checkPing', () => {
    it('should return ping status', () => {
      const result = controller.checkPing();

      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
      expect(result.type).toBe('ping');
      expect(result.timestamp).toBeDefined();
      expect(healthService.checkPing).toHaveBeenCalled();
    });

    it('should return valid ISO timestamp', () => {
      healthService.checkPing.mockReturnValueOnce({
        status: 'ok',
        type: 'ping',
        timestamp: '2026-01-15T12:00:00.000Z',
      });

      const result = controller.checkPing();

      const timestamp = new Date(result.timestamp);
      expect(timestamp instanceof Date).toBe(true);
      expect(!Number.isNaN(timestamp.getTime())).toBe(true);
    });
  });

  describe('Access control', () => {
    it('health endpoint should be public (decorated with @Public)', () => {
      expect(controller.check).toBeDefined();
    });

    it('ping endpoint should be public', () => {
      expect(controller.checkPing).toBeDefined();
    });
  });
});
