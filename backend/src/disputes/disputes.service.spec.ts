import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DisputesService } from './disputes.service';
import {
  Dispute,
  DisputeStatus,
  DisputeResolution,
} from './entities/dispute.entity';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { SorobanService } from '../soroban/soroban.service';
import { Repository } from 'typeorm';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

describe('DisputesService', () => {
  let service: DisputesService;
  let disputesRepository: Repository<Dispute>;
  let marketsRepository: Repository<Market>;
  let sorobanService: SorobanService;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    role: 'user',
    created_at: new Date(),
    updated_at: new Date(),
  } as User;

  const mockMarket: Market = {
    id: 'market-123',
    on_chain_market_id: 'chain-market-123',
    is_resolved: true,
    resolution_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
  } as Market;

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            findAndCount: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Market),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: SorobanService,
          useValue: {
            raiseDispute: jest.fn(),
            resolveDispute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
    disputesRepository = module.get<Repository<Dispute>>(
      getRepositoryToken(Dispute),
    );
    marketsRepository = module.get<Repository<Market>>(
      getRepositoryToken(Market),
    );
    sorobanService = module.get<SorobanService>(SorobanService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDisputeDto: CreateDisputeDto = {
      market_id: 'market-123',
      reason: 'Test dispute reason',
    };

    it('should create a dispute successfully', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(disputesRepository, 'create').mockReturnValue(mockDispute);
      jest.spyOn(disputesRepository, 'save').mockResolvedValue(mockDispute);
      jest.spyOn(service, 'findOne').mockResolvedValue(mockDispute);
      jest.spyOn(sorobanService, 'raiseDispute').mockResolvedValue({
        dispute_id: 'chain-dispute-123',
        tx_hash: 'tx-hash-123',
      });

      const result = await service.create(createDisputeDto, mockUser);

      expect(result).toEqual(mockDispute);
      expect(marketsRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'market-123' },
      });
      expect(disputesRepository.create).toHaveBeenCalledWith({
        marketId: 'market-123',
        disputantId: 'user-123',
        reason: 'Test dispute reason',
        status: DisputeStatus.PENDING,
      });
      expect(sorobanService.raiseDispute).toHaveBeenCalledWith(
        'chain-market-123',
        'Test dispute reason',
      );
    });

    it('should throw NotFoundException if market not found', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(createDisputeDto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if market not resolved', async () => {
      const unresolvedMarket = { ...mockMarket, is_resolved: false };
      jest
        .spyOn(marketsRepository, 'findOne')
        .mockResolvedValue(unresolvedMarket);

      await expect(service.create(createDisputeDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if dispute window has passed', async () => {
      const oldMarket = {
        ...mockMarket,
        resolution_time: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      };
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(oldMarket);

      await expect(service.create(createDisputeDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if dispute already exists', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue(mockDispute);

      await expect(service.create(createDisputeDto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('resolve', () => {
    const resolveDisputeDto: ResolveDisputeDto = {
      resolution: DisputeResolution.UPHELD,
      admin_notes: 'Admin notes',
    };

    const mockAdminUser: User = {
      ...mockUser,
      role: 'admin',
    } as User;

    it('should resolve a dispute successfully', async () => {
      const findOneSpy = jest.spyOn(service, 'findOne');

      // First call returns the pending dispute
      findOneSpy.mockResolvedValueOnce(mockDispute);

      const saveSpy = jest.spyOn(disputesRepository, 'save');
      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
        resolution: DisputeResolution.UPHELD,
      };
      saveSpy.mockResolvedValue(resolvedDispute);

      // Second call returns the resolved dispute
      findOneSpy.mockResolvedValueOnce(resolvedDispute);

      jest.spyOn(sorobanService, 'resolveDispute').mockResolvedValue({
        dispute_id: 'chain-dispute-123',
        tx_hash: 'tx-hash-456',
      });

      const result = await service.resolve(
        'dispute-123',
        resolveDisputeDto,
        mockAdminUser,
      );

      expect(result.status).toBe(DisputeStatus.RESOLVED);
      expect(result.resolution).toBe(DisputeResolution.UPHELD);
      expect(disputesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DisputeStatus.RESOLVED,
          resolution: DisputeResolution.UPHELD,
          adminNotes: 'Admin notes',
          resolvedById: 'user-123',
          resolvedAt: expect.any(Date),
        }),
      );
    });

    it('should throw BadRequestException if dispute is not pending', async () => {
      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
      };
      jest.spyOn(service, 'findOne').mockResolvedValue(resolvedDispute);

      await expect(
        service.resolve('dispute-123', resolveDisputeDto, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a dispute with relations', async () => {
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue(mockDispute);

      const result = await service.findOne('dispute-123');

      expect(result).toEqual(mockDispute);
      expect(disputesRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'dispute-123' },
        relations: ['market', 'disputant', 'resolvedBy'],
      });
    });

    it('should throw NotFoundException if dispute not found', async () => {
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('dispute-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByMarket', () => {
    it('should return disputes for a market', async () => {
      const disputes = [mockDispute];
      jest.spyOn(disputesRepository, 'find').mockResolvedValue(disputes);

      const result = await service.findByMarket('market-123');

      expect(result).toEqual(disputes);
      expect(disputesRepository.find).toHaveBeenCalledWith({
        where: { marketId: 'market-123' },
        relations: ['disputant', 'resolvedBy'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated disputes', async () => {
      const disputes = [mockDispute];
      const mockFindAndCount = [disputes, 1];
      jest
        .spyOn(disputesRepository, 'findAndCount')
        .mockResolvedValue(mockFindAndCount);

      const result = await service.findAll(1, 20);

      expect(result).toEqual({
        disputes,
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(disputesRepository.findAndCount).toHaveBeenCalledWith({
        where: {},
        relations: ['market', 'disputant', 'resolvedBy'],
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should filter by status', async () => {
      const disputes = [mockDispute];
      const mockFindAndCount = [disputes, 1];
      jest
        .spyOn(disputesRepository, 'findAndCount')
        .mockResolvedValue(mockFindAndCount);

      await service.findAll(1, 20, DisputeStatus.PENDING);

      expect(disputesRepository.findAndCount).toHaveBeenCalledWith({
        where: { status: DisputeStatus.PENDING },
        relations: ['market', 'disputant', 'resolvedBy'],
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });
  });

  describe('checkDisputeWindow', () => {
    it('should return true if dispute window is open', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);

      const result = await service.checkDisputeWindow('market-123');

      expect(result).toBe(true);
    });

    it('should return false if market not found', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(null);

      const result = await service.checkDisputeWindow('market-123');

      expect(result).toBe(false);
    });

    it('should return false if market not resolved', async () => {
      const unresolvedMarket = { ...mockMarket, is_resolved: false };
      jest
        .spyOn(marketsRepository, 'findOne')
        .mockResolvedValue(unresolvedMarket);

      const result = await service.checkDisputeWindow('market-123');

      expect(result).toBe(false);
    });

    it('should return false if dispute window has passed', async () => {
      const oldMarket = {
        ...mockMarket,
        resolution_time: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      };
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(oldMarket);

      const result = await service.checkDisputeWindow('market-123');

      expect(result).toBe(false);
    });
  });
});
