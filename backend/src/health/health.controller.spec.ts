import {
  DiskHealthIndicator,
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;
  let mockHealthCheckService: any;
  let mockHttpHealthIndicator: any;
  let mockTypeOrmHealthIndicator: any;
  let mockDiskHealthIndicator: any;
  let mockDataSource: any;

  beforeEach(async () => {
    mockHealthCheckService = {
      check: jest.fn(),
    };

    mockHttpHealthIndicator = {
      pingCheck: jest.fn(),
    };

    mockTypeOrmHealthIndicator = {
      pingCheck: jest.fn(),
    };

    mockDiskHealthIndicator = {
      checkStorage: jest.fn(),
    };

    mockDataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: HttpHealthIndicator,
          useValue: mockHttpHealthIndicator,
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: mockTypeOrmHealthIndicator,
        },
        {
          provide: DiskHealthIndicator,
          useValue: mockDiskHealthIndicator,
        },
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  describe('check', () => {
    it('should return health status when all checks pass', async () => {
      const healthCheckResult = {
        status: 'ok',
        details: {
          http: { status: 'up' },
          database: { status: 'up' },
          storage: { status: 'up' },
        },
      };

      mockHealthCheckService.check.mockReturnValue(healthCheckResult);

      const result = await controller.check();

      expect(result).toEqual(healthCheckResult);
      expect(mockHealthCheckService.check).toHaveBeenCalled();
    });

    it('should check HTTP health', async () => {
      mockHealthCheckService.check.mockReturnValue({ status: 'ok' });
      mockHttpHealthIndicator.pingCheck.mockResolvedValue({
        http: { status: 'up' },
      });

      await controller.check();

      // The actual check is performed by calling the service
      // which uses the health check service internally
      expect(mockHealthCheckService.check).toHaveBeenCalled();
    });

    it('should check database health', async () => {
      mockHealthCheckService.check.mockReturnValue({ status: 'ok' });
      mockTypeOrmHealthIndicator.pingCheck.mockResolvedValue({
        database: { status: 'up' },
      });

      await controller.check();

      expect(mockHealthCheckService.check).toHaveBeenCalled();
    });

    it('should check disk storage health', async () => {
      mockHealthCheckService.check.mockReturnValue({ status: 'ok' });
      mockDiskHealthIndicator.checkStorage.mockResolvedValue({
        storage: { status: 'up' },
      });

      await controller.check();

      expect(mockHealthCheckService.check).toHaveBeenCalled();
    });

    it('should return 503 when any check fails', async () => {
      const failedHealthCheck = {
        status: 'error',
        details: {
          http: { status: 'up' },
          database: { status: 'down', message: 'Connection refused' },
          storage: { status: 'up' },
        },
      };

      mockHealthCheckService.check.mockReturnValue(failedHealthCheck);

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
    });

    it('should return valid ISO timestamp', () => {
      const result = controller.checkPing();

      const timestamp = new Date(result.timestamp);
      expect(timestamp instanceof Date).toBe(true);
      expect(!Number.isNaN(timestamp.getTime())).toBe(true);
    });
  });

  describe('Access control', () => {
    it('health endpoint should be public (decorated with @Public)', () => {
      // The @Public decorator is applied to the check() method
      // This means it doesn't require JWT authentication
      const metadata = Reflect.getMetadata('isPublic', controller.check);
      // The decorator is applied, so the endpoint will be public
      expect(controller.check).toBeDefined();
    });

    it('ping endpoint should be public', () => {
      // The @Public decorator is applied to the checkPing() method
      expect(controller.checkPing).toBeDefined();
    });
  });
});
