import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  Competition,
  CompetitionVisibility,
} from './entities/competition.entity';
import { CompetitionParticipant } from './entities/competition-participant.entity';
import { CompetitionBracket } from './entities/competition-bracket.entity';
import { BracketRound } from './entities/bracket-round.entity';
import { BracketMatchup } from './entities/bracket-matchup.entity';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { SeedingMetric } from './dto/generate-bracket.dto';
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
    is_cancelled: false,
    invite_code: undefined,
    created_at: new Date('2024-01-01'),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    increment: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };

  const mockParticipantsRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockBracketRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockRoundRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockMatchupRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockNotificationsService = {
    create: jest.fn(),
  };

  const makeListQueryBuilder = (competitions: Partial<Competition>[]) => {
    let statusClause: string | null = null;
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn((clause: string) => {
        statusClause = clause;
        return qb;
      }),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockImplementation(() => {
        const filtered = competitions.filter((competition) => {
          if (!statusClause) {
            return true;
          }

          if (statusClause.includes('start_time <= :now')) {
            return (
              competition.start_time! <= currentNow &&
              competition.end_time! >= currentNow &&
              competition.is_cancelled !== true
            );
          }

          if (statusClause.includes('start_time > :now')) {
            return (
              competition.start_time! > currentNow &&
              competition.is_cancelled !== true
            );
          }

          if (statusClause.includes('end_time < :now')) {
            return (
              competition.end_time! < currentNow &&
              competition.is_cancelled !== true
            );
          }

          if (statusClause.includes('is_cancelled = true')) {
            return competition.is_cancelled === true;
          }

          return true;
        });

        return Promise.resolve([filtered, filtered.length]);
      }),
    };

    return qb;
  };

  let currentNow = new Date();

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
        {
          provide: getRepositoryToken(CompetitionBracket),
          useValue: mockBracketRepo,
        },
        {
          provide: getRepositoryToken(BracketRound),
          useValue: mockRoundRepo,
        },
        {
          provide: getRepositoryToken(BracketMatchup),
          useValue: mockMatchupRepo,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
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

  describe('list', () => {
    beforeEach(() => {
      currentNow = new Date('2026-06-15T12:00:00.000Z');
      jest.useFakeTimers();
      jest.setSystemTime(currentNow);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns only active competitions for status=active', async () => {
      const upcoming = {
        ...mockCompetition,
        id: 'upcoming',
        title: 'Upcoming',
        start_time: new Date('2026-06-22T12:00:00.000Z'),
        end_time: new Date('2026-06-29T12:00:00.000Z'),
      };
      const active = {
        ...mockCompetition,
        id: 'active',
        title: 'Active',
        start_time: new Date('2026-06-14T12:00:00.000Z'),
        end_time: new Date('2026-06-21T12:00:00.000Z'),
      };
      const ended = {
        ...mockCompetition,
        id: 'ended',
        title: 'Ended',
        start_time: new Date('2026-06-01T12:00:00.000Z'),
        end_time: new Date('2026-06-08T12:00:00.000Z'),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        makeListQueryBuilder([upcoming, active, ended]) as never,
      );

      const result = await service.list({ status: 'active' as never });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Active');
    });

    it('returns only upcoming competitions for status=upcoming', async () => {
      const upcoming = {
        ...mockCompetition,
        id: 'upcoming',
        title: 'Upcoming',
        start_time: new Date('2026-06-22T12:00:00.000Z'),
        end_time: new Date('2026-06-29T12:00:00.000Z'),
      };
      const active = {
        ...mockCompetition,
        id: 'active',
        title: 'Active',
        start_time: new Date('2026-06-14T12:00:00.000Z'),
        end_time: new Date('2026-06-21T12:00:00.000Z'),
      };
      const ended = {
        ...mockCompetition,
        id: 'ended',
        title: 'Ended',
        start_time: new Date('2026-06-01T12:00:00.000Z'),
        end_time: new Date('2026-06-08T12:00:00.000Z'),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        makeListQueryBuilder([upcoming, active, ended]) as never,
      );

      const result = await service.list({ status: 'upcoming' as never });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Upcoming');
    });

    it('returns only ended competitions for status=ended', async () => {
      const upcoming = {
        ...mockCompetition,
        id: 'upcoming',
        title: 'Upcoming',
        start_time: new Date('2026-06-22T12:00:00.000Z'),
        end_time: new Date('2026-06-29T12:00:00.000Z'),
      };
      const active = {
        ...mockCompetition,
        id: 'active',
        title: 'Active',
        start_time: new Date('2026-06-14T12:00:00.000Z'),
        end_time: new Date('2026-06-21T12:00:00.000Z'),
      };
      const ended = {
        ...mockCompetition,
        id: 'ended',
        title: 'Ended',
        start_time: new Date('2026-06-01T12:00:00.000Z'),
        end_time: new Date('2026-06-08T12:00:00.000Z'),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        makeListQueryBuilder([upcoming, active, ended]) as never,
      );

      const result = await service.list({ status: 'ended' as never });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Ended');
    });
  });

  describe('findAll', () => {
    it('should return only public competitions', async () => {
      mockRepository.find.mockResolvedValue([mockCompetition]);

      const result = await service.findAll();

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            visibility: CompetitionVisibility.Public,
            is_cancelled: false,
          },
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

  describe('joinCompetition', () => {
    it('should throw BadRequestException when competition is cancelled', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockCompetition,
        end_time: new Date(Date.now() + 1000 * 60 * 60),
        is_cancelled: true,
      });

      await expect(
        service.joinCompetition('comp-uuid-1', mockUser as User),
      ).rejects.toThrow(BadRequestException);

      expect(mockParticipantsRepository.findOne).not.toHaveBeenCalled();
    });

    it('should allow joining a non-cancelled, active competition', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockCompetition,
        id: 'comp-uuid-1',
        end_time: new Date(Date.now() + 1000 * 60 * 60),
        is_cancelled: false,
        max_participants: 0,
      });
      mockParticipantsRepository.findOne.mockResolvedValue(null);
      mockParticipantsRepository.create.mockImplementation((v) => v);
      mockParticipantsRepository.save.mockImplementation((v) =>
        Promise.resolve({ id: 'participant-1', ...v }),
      );
      mockRepository.increment.mockResolvedValue(undefined);

      const result = await service.joinCompetition(
        'comp-uuid-1',
        mockUser as User,
      );

      expect(result.id).toBe('participant-1');
      expect(mockRepository.increment).toHaveBeenCalledWith(
        { id: 'comp-uuid-1' },
        'participant_count',
        1,
      );
    });
  });

  describe('cancel', () => {
    const creatorCompetition = {
      ...mockCompetition,
      id: 'comp-uuid-1',
      is_cancelled: false,
      creator: { id: 'user-uuid-1' },
    };

    it('should throw NotFoundException if competition does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.cancel('missing-id', 'user-uuid-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if not the creator', async () => {
      mockRepository.findOne.mockResolvedValue(creatorCompetition);

      await expect(
        service.cancel('comp-uuid-1', 'someone-else'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if already cancelled', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...creatorCompetition,
        is_cancelled: true,
      });

      await expect(
        service.cancel('comp-uuid-1', 'user-uuid-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should mark competition cancelled and notify participants', async () => {
      mockRepository.findOne.mockResolvedValue({ ...creatorCompetition });
      mockRepository.save.mockImplementation((v) => Promise.resolve(v));
      mockParticipantsRepository.find.mockResolvedValue([
        {
          user_id: 'user-uuid-2',
          user: { stellar_address: 'GPARTICIPANT1' },
        },
        {
          user_id: 'user-uuid-3',
          user: { stellar_address: 'GPARTICIPANT2' },
        },
      ]);

      const result = await service.cancel('comp-uuid-1', 'user-uuid-1');

      expect(result.is_cancelled).toBe(true);
      expect(mockNotificationsService.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        'GPARTICIPANT1',
        'event_cancelled',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ competition_id: 'comp-uuid-1' }),
        'user-uuid-2',
      );
    });

    it('should not fail cancellation if a participant has no linked user address', async () => {
      mockRepository.findOne.mockResolvedValue({ ...creatorCompetition });
      mockRepository.save.mockImplementation((v) => Promise.resolve(v));
      mockParticipantsRepository.find.mockResolvedValue([
        { user_id: 'user-uuid-2', user: null },
      ]);

      const result = await service.cancel('comp-uuid-1', 'user-uuid-1');

      expect(result.is_cancelled).toBe(true);
      expect(mockNotificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('should remove participant and decrement count before competition starts', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      const comp = { ...mockCompetition, start_time: futureDate };
      mockRepository.findOne.mockResolvedValue(comp);

      const mockManager = {
        findOne: jest.fn().mockResolvedValue({ id: 'part-1' }),
        remove: jest.fn().mockResolvedValue({}),
        decrement: jest.fn().mockResolvedValue({}),
      };

      mockRepository.manager.transaction.mockImplementation(
        (cb: (manager: unknown) => Promise<unknown>) => cb(mockManager),
      );

      await service.leave('comp-uuid-1', 'user-uuid-1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'comp-uuid-1' },
      });
      expect(mockManager.findOne).toHaveBeenCalled();
      expect(mockManager.remove).toHaveBeenCalled();
      expect(mockManager.decrement).toHaveBeenCalledWith(
        Competition,
        { id: 'comp-uuid-1' },
        'participant_count',
        1,
      );
    });

    it('should throw NotFoundException if competition does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.leave('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if competition has already started', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      const comp = { ...mockCompetition, start_time: pastDate };
      mockRepository.findOne.mockResolvedValue(comp);

      await expect(service.leave('comp-1', 'user-1')).rejects.toThrow(
        'Cannot leave competition after it has started',
      );
    });

    it('should throw NotFoundException if user is not a participant', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      const comp = { ...mockCompetition, start_time: futureDate };
      mockRepository.findOne.mockResolvedValue(comp);

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      mockRepository.manager.transaction.mockImplementation(
        (cb: (manager: unknown) => Promise<unknown>) => cb(mockManager),
      );

      await expect(service.leave('comp-1', 'user-1')).rejects.toThrow(
        'You are not a participant in this competition',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Bracket generation
  // -------------------------------------------------------------------------

  describe('generateBracket', () => {
    const mockBracketRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    const mockRoundRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };
    const mockMatchupRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should throw NotFoundException if competition not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.generateBracket(
          'comp-1',
          { metric: SeedingMetric.Score },
          'user-1',
        ),
      ).rejects.toThrow('Competition with ID "comp-1" not found');
    });

    it('should throw ForbiddenException if not creator', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockCompetition,
        creator: { id: 'other-user' },
      });

      await expect(
        service.generateBracket(
          'comp-1',
          { metric: SeedingMetric.Score },
          'user-1',
        ),
      ).rejects.toThrow('Only the creator can generate a bracket');
    });

    it('should throw BadRequestException if fewer than 2 participants', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockCompetition,
        creator: { id: 'user-1' },
      });
      mockBracketRepo.findOne.mockResolvedValue(null);
      mockParticipantsRepository.find.mockResolvedValue([{ id: 'p1' }]);

      await expect(
        service.generateBracket(
          'comp-1',
          { metric: SeedingMetric.Score },
          'user-1',
        ),
      ).rejects.toThrow('At least 2 participants');
    });
  });

  describe('getBracket', () => {
    it('should throw NotFoundException if no bracket exists', async () => {
      mockBracketRepo.findOne.mockResolvedValue(null);

      await expect(service.getBracket('comp-1')).rejects.toThrow(
        'No bracket found',
      );
    });
  });

  describe('generateBracket - structure correctness', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockBracketRepo.create.mockImplementation((v) => v);
      mockBracketRepo.save.mockImplementation((v) =>
        Promise.resolve({ id: 'bracket-1', ...v }),
      );
      mockRoundRepo.create.mockImplementation((v) => v);
      mockRoundRepo.save.mockImplementation((v, i) =>
        Promise.resolve({ id: `round-${v.round_number}`, ...v }),
      );
      let matchupCounter = 0;
      mockMatchupRepo.create.mockImplementation((v) => v);
      mockMatchupRepo.save.mockImplementation((v) =>
        Promise.resolve({ id: `matchup-${matchupCounter++}`, ...v }),
      );
    });

    const seedParticipants = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `p${i + 1}`,
        score: count - i,
        joined_at: new Date(2026, 0, i + 1),
      }));

    it('produces a full bracket with no byes for a power-of-two count (4)', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockCompetition,
        creator: { id: 'user-1' },
      });
      mockBracketRepo.findOne.mockResolvedValue(null);
      mockParticipantsRepository.find.mockResolvedValue(seedParticipants(4));

      const bracket = await service.generateBracket(
        'comp-1',
        { metric: SeedingMetric.Score },
        'user-1',
      );

      expect(bracket.total_rounds).toBe(2);

      const firstRoundMatchups = mockMatchupRepo.save.mock.calls
        .map((call) => call[0])
        .filter((m) => m.round_id === 'round-1');

      expect(firstRoundMatchups).toHaveLength(2);
      expect(firstRoundMatchups.every((m) => !m.is_bye)).toBe(true);
      // Top seed (p1) faces the lowest remaining seed (p4); p2 faces p3.
      expect(firstRoundMatchups[0]).toMatchObject({
        participant_1_id: 'p1',
        participant_2_id: 'p2',
      });
    });

    it('assigns byes to top seeds for a non-power-of-two count (5)', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockCompetition,
        creator: { id: 'user-1' },
      });
      mockBracketRepo.findOne.mockResolvedValue(null);
      mockParticipantsRepository.find.mockResolvedValue(seedParticipants(5));

      const bracket = await service.generateBracket(
        'comp-1',
        { metric: SeedingMetric.Score },
        'user-1',
      );

      // 5 participants -> bracket size 8 -> 3 rounds, 3 byes in round 1.
      expect(bracket.total_rounds).toBe(3);

      const firstRoundMatchups = mockMatchupRepo.save.mock.calls
        .map((call) => call[0])
        .filter((m) => m.round_id === 'round-1');

      expect(firstRoundMatchups).toHaveLength(4);
      const byes = firstRoundMatchups.filter((m) => m.is_bye);
      expect(byes).toHaveLength(3);
      // Byes go to the top 3 seeds and each auto-advances as the winner.
      expect(byes.map((m) => m.participant_1_id)).toEqual(['p1', 'p2', 'p3']);
      byes.forEach((m) => {
        expect(m.participant_2_id).toBeNull();
        expect(m.winner_id).toBe(m.participant_1_id);
      });

      const nonByeMatchups = firstRoundMatchups.filter((m) => !m.is_bye);
      expect(nonByeMatchups).toHaveLength(1);
      expect(nonByeMatchups[0]).toMatchObject({
        participant_1_id: 'p4',
        participant_2_id: 'p5',
        winner_id: null,
      });

      // Subsequent rounds are created empty (no participants assigned yet).
      const laterRoundMatchups = mockMatchupRepo.save.mock.calls
        .map((call) => call[0])
        .filter((m) => m.round_id !== 'round-1');
      expect(laterRoundMatchups).toHaveLength(2 + 1); // round-2 (2) + round-3 (1)
      laterRoundMatchups.forEach((m) => {
        expect(m.participant_1_id).toBeNull();
        expect(m.participant_2_id).toBeNull();
        expect(m.is_bye).toBe(false);
      });
    });

    it('throws ConflictException if a bracket already exists', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockCompetition,
        creator: { id: 'user-1' },
      });
      mockBracketRepo.findOne.mockResolvedValue({ id: 'existing-bracket' });

      await expect(
        service.generateBracket(
          'comp-1',
          { metric: SeedingMetric.Score },
          'user-1',
        ),
      ).rejects.toThrow('Bracket already exists');
    });
  });
});
