import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Market } from '../markets/entities/market.entity';

describe('AdminController', () => {
  let controller: AdminController;
  let service: jest.Mocked<AdminService>;

  const mockMarket = {
    id: 'market-1',
    on_chain_market_id: 'on-chain-1',
    title: 'Test Market',
    is_featured: false,
    featured_at: null,
  } as Market;

  const mockRequest = {
    user: { id: 'admin-1' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            featureMarket: jest.fn(),
            unfeatureMarket: jest.fn(),
            getActivityReport: jest.fn(),
            getStats: jest.fn(),
            listFlags: jest.fn(),
            resolveFlag: jest.fn(),
            adminResolveMarket: jest.fn(),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    service = module.get(AdminService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('featureMarket', () => {
    it('should feature a market', async () => {
      const featuredMarket = {
        ...mockMarket,
        is_featured: true,
        featured_at: new Date(),
      };
      service.featureMarket.mockResolvedValue(featuredMarket);

      const result = await controller.featureMarket('market-1', mockRequest);

      expect(result.is_featured).toBe(true);
      expect(service.featureMarket).toHaveBeenCalledWith('market-1', 'admin-1');
    });

    it('should throw 404 for unknown market', async () => {
      service.featureMarket.mockRejectedValue(new Error('Market not found'));

      await expect(
        controller.featureMarket('unknown-id', mockRequest),
      ).rejects.toThrow();
    });
  });

  describe('unfeatureMarket', () => {
    it('should unfeature a market', async () => {
      const unfeaturedMarket = {
        ...mockMarket,
        is_featured: false,
        featured_at: null,
      };
      service.unfeatureMarket.mockResolvedValue(unfeaturedMarket);

      const result = await controller.unfeatureMarket('market-1', mockRequest);

      expect(result.is_featured).toBe(false);
      expect(result.featured_at).toBeNull();
      expect(service.unfeatureMarket).toHaveBeenCalledWith(
        'market-1',
        'admin-1',
      );
    });

    it('should throw 404 for unknown market', async () => {
      service.unfeatureMarket.mockRejectedValue(new Error('Market not found'));

      await expect(
        controller.unfeatureMarket('unknown-id', mockRequest),
      ).rejects.toThrow();
    });
  });

  describe('getDashboardStats', () => {
    it('should return platform stats', async () => {
      const mockStats = {
        total_users: 100,
        active_users_24h: 10,
        active_users_7d: 50,
        total_markets: 20,
        active_markets: 15,
        resolved_markets: 5,
        total_predictions: 200,
        total_volume_stroops: '1000000',
        total_competitions: 5,
        platform_revenue_stroops: '20000',
        pending_flags: 3,
      };
      service.getStats.mockResolvedValue(mockStats);

      const result = await controller.getDashboardStats();

      expect(result).toEqual(mockStats);
      expect(service.getStats).toHaveBeenCalled();
    });
  });

  describe('listFlags', () => {
    it('should list flags', async () => {
      const mockFlags = {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };
      service.listFlags.mockResolvedValue(mockFlags);

      const result = await controller.listFlags({
        page: '1',
        limit: '10',
      } as any);

      expect(result).toEqual(mockFlags);
      expect(service.listFlags).toHaveBeenCalledWith({
        page: '1',
        limit: '10',
      });
    });
  });

  describe('resolveFlag', () => {
    it('should resolve a flag', async () => {
      const mockFlag = { id: 'flag-1' } as any;
      service.resolveFlag.mockResolvedValue(mockFlag);

      const result = await controller.resolveFlag(
        'flag-1',
        { action: 'dismiss' } as any,
        mockRequest,
      );

      expect(result).toEqual(mockFlag);
      expect(service.resolveFlag).toHaveBeenCalledWith(
        'flag-1',
        { action: 'dismiss' },
        'admin-1',
      );
    });
  });

  describe('resolveMarket', () => {
    it('should resolve a market', async () => {
      const resolvedMarket = { ...mockMarket, is_resolved: true };
      service.adminResolveMarket.mockResolvedValue(resolvedMarket as any);

      const result = await controller.resolveMarket(
        'market-1',
        { resolved_outcome: 'A' },
        mockRequest,
      );

      expect(result.is_resolved).toBe(true);
      expect(service.adminResolveMarket).toHaveBeenCalledWith(
        'market-1',
        { resolved_outcome: 'A' },
        'admin-1',
      );
    });
  });
});
