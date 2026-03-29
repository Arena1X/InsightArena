import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from '../analytics/analytics.service';
import { Competition } from '../competitions/entities/competition.entity';
import { Market } from '../markets/entities/market.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Prediction } from '../predictions/entities/prediction.entity';
import { SorobanService } from '../soroban/soroban.service';
import { User } from '../users/entities/user.entity';
import { ActivityLog } from '../analytics/entities/activity-log.entity';
import { AdminService } from './admin.service';
import { SystemConfig } from './entities/system-config.entity';
import { DEFAULT_CONFIG } from './dto/system-config.dto';

const mockRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('AdminService - system config', () => {
  let service: AdminService;
  let configRepo: ReturnType<typeof mockRepo>;
  let analyticsService: jest.Mocked<Pick<AnalyticsService, 'logActivity'>>;

  const adminId = 'admin-1';

  beforeEach(async () => {
    configRepo = mockRepo();
    analyticsService = { logActivity: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: mockRepo() },
        { provide: getRepositoryToken(Market), useValue: mockRepo() },
        { provide: getRepositoryToken(Prediction), useValue: mockRepo() },
        { provide: getRepositoryToken(Competition), useValue: mockRepo() },
        { provide: getRepositoryToken(ActivityLog), useValue: mockRepo() },
        { provide: getRepositoryToken(SystemConfig), useValue: configRepo },
        { provide: AnalyticsService, useValue: analyticsService },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: SorobanService, useValue: { resolveMarket: jest.fn() } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('getConfig', () => {
    it('returns defaults when no rows exist', async () => {
      configRepo.find.mockResolvedValue([]);
      const config = await service.getConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('merges stored values over defaults', async () => {
      configRepo.find.mockResolvedValue([
        { key: 'platform_fee_percent', value: 5 },
        { key: 'maintenance_mode', value: true },
      ]);
      const config = await service.getConfig();
      expect(config.platform_fee_percent).toBe(5);
      expect(config.maintenance_mode).toBe(true);
      expect(config.min_stake_stroops).toBe(DEFAULT_CONFIG.min_stake_stroops);
    });

    it('returns cached value on second call', async () => {
      configRepo.find.mockResolvedValue([]);
      await service.getConfig();
      await service.getConfig();
      expect(configRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateConfig', () => {
    it('saves each provided key and invalidates cache', async () => {
      configRepo.find.mockResolvedValue([]);
      configRepo.save.mockResolvedValue({});

      await service.updateConfig({ platform_fee_percent: 3 }, adminId);

      expect(configRepo.save).toHaveBeenCalledWith({ key: 'platform_fee_percent', value: 3 });
      expect(analyticsService.logActivity).toHaveBeenCalledWith(
        adminId,
        'SYSTEM_CONFIG_UPDATED',
        expect.objectContaining({ updated_keys: ['platform_fee_percent'] }),
      );
    });

    it('does not save keys with undefined values', async () => {
      configRepo.find.mockResolvedValue([]);
      configRepo.save.mockResolvedValue({});

      await service.updateConfig({ maintenance_mode: true }, adminId);

      expect(configRepo.save).toHaveBeenCalledTimes(1);
      expect(configRepo.save).toHaveBeenCalledWith({ key: 'maintenance_mode', value: true });
    });
  });
});
