import { Test, TestingModule } from '@nestjs/testing';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { User } from '../users/entities/user.entity';
import { CreateDisputeDto } from './dto/create-dispute.dto';

describe('DisputesController', () => {
  let controller: DisputesController;
  let service: DisputesService;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    role: 'user',
    created_at: new Date(),
    updated_at: new Date(),
  } as User;

  const mockMarket = {
    id: 'market-123',
    on_chain_market_id: 'chain-market-123',
    is_resolved: true,
    resolution_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  } as any;

  const mockDispute: Dispute = {
    id: 'dispute-123',
    marketId: 'market-123',
    disputantId: 'user-123',
    reason: 'Test dispute reason',
    status: DisputeStatus.PENDING,
    market: mockMarket,
    disputant: mockUser,
    createdAt: new Date(),
  } as Dispute;

  beforeEach(async () => {
    const mockDisputesService = {
      create: jest.fn(),
      findOne: jest.fn(),
      findAll: jest.fn(),
      findByMarket: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DisputesController],
      providers: [
        {
          provide: DisputesService,
          useValue: mockDisputesService,
        },
      ],
    }).compile();

    controller = module.get<DisputesController>(DisputesController);
    service = module.get<DisputesService>(DisputesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const createDisputeDto: CreateDisputeDto = {
      market_id: 'market-123',
      reason: 'Test dispute reason',
    };

    it('should create a dispute', async () => {
      jest.spyOn(service, 'create').mockResolvedValue(mockDispute);

      const result = await controller.create(createDisputeDto, mockUser);

      expect(result).toEqual(mockDispute);
      expect(service.create).toHaveBeenCalledWith(createDisputeDto, mockUser);
    });
  });

  describe('findOne', () => {
    it('should return a dispute', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockDispute);

      const result = await controller.findOne('dispute-123');

      expect(result).toEqual(mockDispute);
      expect(service.findOne).toHaveBeenCalledWith('dispute-123');
    });
  });

  describe('findAll', () => {
    it('should return paginated disputes', async () => {
      const mockResult = {
        disputes: [mockDispute],
        total: 1,
        page: 1,
        limit: 20,
      };
      jest.spyOn(service, 'findAll').mockResolvedValue(mockResult);

      const result = await controller.findAll('1', '20');

      expect(result).toEqual(mockResult);
      expect(service.findAll).toHaveBeenCalledWith(1, 20, undefined);
    });

    it('should parse query parameters correctly', async () => {
      const mockResult = {
        disputes: [mockDispute],
        total: 1,
        page: 2,
        limit: 10,
      };
      jest.spyOn(service, 'findAll').mockResolvedValue(mockResult);

      await controller.findAll('2', '10', DisputeStatus.PENDING);

      expect(service.findAll).toHaveBeenCalledWith(
        2,
        10,
        DisputeStatus.PENDING,
      );
    });

    it('should use default values for pagination', async () => {
      const mockResult = {
        disputes: [mockDispute],
        total: 1,
        page: 1,
        limit: 20,
      };
      jest.spyOn(service, 'findAll').mockResolvedValue(mockResult);

      await controller.findAll();

      expect(service.findAll).toHaveBeenCalledWith(1, 20, undefined);
    });
  });

  describe('findByMarket', () => {
    it('should return disputes for a market', async () => {
      jest.spyOn(service, 'findByMarket').mockResolvedValue([mockDispute]);

      const result = await controller.findByMarket('market-123');

      expect(result).toEqual([mockDispute]);
      expect(service.findByMarket).toHaveBeenCalledWith('market-123');
    });
  });
});
