import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import {
  Competition,
  CompetitionVisibility,
} from './entities/competition.entity';
import { CompetitionParticipant } from './entities/competition-participant.entity';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { User } from '../users/entities/user.entity';

describe('CompetitionsService', () => {
  let service: CompetitionsService;

  const mockUser: Partial<User> = {
    id: 'user-uuid-1',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
    username: 'testuser',
  };

  const mockCompetition: Partial<Competition> = {
    id: 'comp-uuid-1',
    title: 'Test Competition',
    description: 'A test competition.',
    start_time: new Date('2026-04-01'),
    end_time: new Date('2026-06-30'),
    prize_pool_stroops: '5000000000',
    visibility: CompetitionVisibility.Public,
    invite_code: undefined,
    created_at: new Date('2024-01-01'),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockParticipantsRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitionsService,
        {
          provide: getRepositoryToken(Competition),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(CompetitionParticipant),
          useValue: mockParticipantsRepository,
        },
      ],
    }).compile();

    service = module.get<CompetitionsService>(CompetitionsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateCompetitionDto = {
      title: 'Test Competition',
      description: 'A test competition.',
      start_time: '2026-04-01T00:00:00.000Z',
      end_time: '2026-06-30T23:59:59.000Z',
      prize_pool_stroops: '5000000000',
      visibility: CompetitionVisibility.Public,
    };

    it('should create a public competition without invite_code', async () => {
      mockRepository.create.mockReturnValue(mockCompetition);
      mockRepository.save.mockResolvedValue(mockCompetition);

      const result = await service.create(dto, mockUser as User);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: dto.title,
          visibility: CompetitionVisibility.Public,
          invite_code: undefined,
        }),
      );
      expect(result).toEqual(mockCompetition);
    });

    it('should create a private competition with a 6-char invite_code', async () => {
      const privateDto = { ...dto, visibility: CompetitionVisibility.Private };
      const privateComp = {
        ...mockCompetition,
        invite_code: 'ABC123',
        visibility: CompetitionVisibility.Private,
      };
      mockRepository.create.mockReturnValue(privateComp);
      mockRepository.save.mockResolvedValue(privateComp);

      await service.create(privateDto, mockUser as User);

      const createCall = mockRepository.create.mock.calls[0] as [
        Record<string, unknown>,
      ];
      const createArg = createCall[0];
      expect(createArg['invite_code']).toBeDefined();
      expect(String(createArg['invite_code'])).toHaveLength(6);
    });

    it('should not set invite_code for public competitions', async () => {
      mockRepository.create.mockReturnValue(mockCompetition);
      mockRepository.save.mockResolvedValue(mockCompetition);

      await service.create(dto, mockUser as User);

      const createCall = mockRepository.create.mock.calls[0] as [
        Record<string, unknown>,
      ];
      const createArg = createCall[0];
      expect(createArg['invite_code']).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return only public competitions', async () => {
      mockRepository.find.mockResolvedValue([mockCompetition]);

      const result = await service.findAll();

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { visibility: CompetitionVisibility.Public },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return a competition by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockCompetition);

      const result = await service.findById('comp-uuid-1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'comp-uuid-1' },
        relations: ['creator'],
      });
      expect(result).toEqual(mockCompetition);
    });

    it('should return null when competition not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('getParticipants', () => {
    it('should return paginated participants for a competition', async () => {
      mockRepository.findOne.mockResolvedValue(mockCompetition);

      const participants = [
        {
          id: 'part-1',
          user_id: 'user-1',
          competition_id: 'comp-uuid-1',
          score: 100,
          rank: 1,
          joined_at: new Date(),
          user: {
            id: 'user-1',
            username: 'alice',
            stellar_address: 'GABCDEF',
          },
        },
        {
          id: 'part-2',
          user_id: 'user-2',
          competition_id: 'comp-uuid-1',
          score: 50,
          rank: 2,
          joined_at: new Date(),
          user: {
            id: 'user-2',
            username: null,
            stellar_address: 'GXYZ123',
          },
        },
      ];

      const qbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([participants, 2]),
      };
      mockParticipantsRepository.createQueryBuilder.mockReturnValue(qbMock);

      const result = await service.getParticipants('comp-uuid-1', {
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0].username).toBe('alice');
      expect(result.data[0].score).toBe(100);
      expect(result.data[1].username).toBeNull();
    });

    it('should throw NotFoundException if competition does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getParticipants('non-existent', { page: 1, limit: 20 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyRank', () => {
    it('should return user rank and percentile', async () => {
      mockRepository.findOne.mockResolvedValue(mockCompetition);
      mockParticipantsRepository.findOne.mockResolvedValue({
        id: 'part-1',
        user_id: 'user-uuid-1',
        score: 100,
        joined_at: new Date('2024-01-01'),
      });

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(4), // 4 people ahead
      };
      mockParticipantsRepository.createQueryBuilder.mockReturnValue(qbMock);
      mockParticipantsRepository.count.mockResolvedValue(10); // 10 total

      const result = await service.getMyRank('comp-uuid-1', 'user-uuid-1');

      expect(result).toEqual({
        rank: 5,
        score: 100,
        total_participants: 10,
        percentile: 60, // (1 - (5-1)/10) * 100 = 60
      });
    });

    it('should throw NotFoundException if user is not a participant', async () => {
      mockRepository.findOne.mockResolvedValue(mockCompetition);
      mockParticipantsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getMyRank('comp-uuid-1', 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if competition does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getMyRank('non-existent', 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use cache on subsequent calls', async () => {
      mockRepository.findOne.mockResolvedValue(mockCompetition);
      mockParticipantsRepository.findOne.mockResolvedValue({
        id: 'part-1',
        user_id: 'user-uuid-1',
        score: 100,
        joined_at: new Date('2024-01-01'),
      });

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      mockParticipantsRepository.createQueryBuilder.mockReturnValue(qbMock);
      mockParticipantsRepository.count.mockResolvedValue(1);

      // First call
      await service.getMyRank('comp-uuid-1', 'user-uuid-1');
      // Second call should hit cache
      await service.getMyRank('comp-uuid-1', 'user-uuid-1');

      expect(
        mockParticipantsRepository.createQueryBuilder,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
