import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
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
});
