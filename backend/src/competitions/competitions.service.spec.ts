import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CompetitionsService } from './competitions.service';
import {
  Competition,
  CompetitionVisibility,
} from './entities/competition.entity';
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitionsService,
        {
          provide: getRepositoryToken(Competition),
          useValue: mockRepository,
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
});
