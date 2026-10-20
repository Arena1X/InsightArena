import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import {
  CreatorEventsController,
  PublicCreatorEventsController,
} from './creator-events.controller';
import { CreatorEventsService } from './creator-events.service';
import {
  ListMatchesQueryDto,
  MatchStatus,
  MatchSortBy,
  SortOrder,
} from './dto/list-matches-query.dto';
import { EventByCodeResponseDto } from './dto/event-by-code-response.dto';
import { UserScoreResponseDto } from './dto/user-score-response.dto';
import { UserPredictionsResponseDto } from './dto/user-predictions-response.dto';
import { EventStatsResponseDto } from './dto/event-stats-response.dto';

describe('CreatorEventsController', () => {
  let controller: CreatorEventsController;
  let service: jest.Mocked<CreatorEventsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [CreatorEventsController],
      providers: [
        {
          provide: CreatorEventsService,
          useValue: {
            getEventById: jest.fn(),
            getParticipants: jest.fn(),
            getEventMatches: jest.fn(),
            getUserScore: jest.fn(),
            getUserPredictionsForEvent: jest.fn(),
            getEventStats: jest.fn(),
            getContractConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CreatorEventsController>(CreatorEventsController);
    service = module.get(CreatorEventsService);
  });

  describe('getEventMatches', () => {
    it('should call service with correct parameters', async () => {
      const query: ListMatchesQueryDto = {
        status: MatchStatus.All,
        sortBy: MatchSortBy.MatchTime,
        sortOrder: SortOrder.Asc,
      };

      service.getEventMatches.mockResolvedValue([]);

      await controller.getEventMatches('event-1', query);

      expect(service.getEventMatches).toHaveBeenCalledWith('event-1', query);
    });

    it('should return matches from service', async () => {
      const mockMatches = [
        {
          matchId: 'match-1',
          eventId: 'event-1',
          homeTeam: 'Team A',
          awayTeam: 'Team B',
          startTime: 1100000,
          resolved: false,
          outcome: null,
          predictionCount: 10,
        },
      ];

      const query: ListMatchesQueryDto = {
        status: MatchStatus.All,
        sortBy: MatchSortBy.MatchTime,
        sortOrder: SortOrder.Asc,
      };

      service.getEventMatches.mockResolvedValue(mockMatches);

      const result = await controller.getEventMatches('event-1', query);

      expect(result).toEqual(mockMatches);
    });
  });

  describe('getUserPredictions', () => {
    it('should call service with correct parameters', async () => {
      const mockResponse: UserPredictionsResponseDto = {
        address: 'GUSER1',
        eventId: 'event-1',
        score: {
          totalPredictions: 2,
          correctPredictions: 1,
          accuracyPercentage: 50,
          matchesRemaining: 0,
        },
        predictions: [],
      };

      service.getUserPredictionsForEvent.mockResolvedValue(mockResponse);

      await controller.getUserPredictions('event-1', 'GUSER1');

      expect(service.getUserPredictionsForEvent).toHaveBeenCalledWith(
        'event-1',
        'GUSER1',
      );
    });
  });

  describe('getEventStats', () => {
    it('should return event stats from service', async () => {
      const mockStats: EventStatsResponseDto = {
        eventId: 'event-1',
        totalParticipants: 10,
        totalMatches: 5,
        matchesResolved: 3,
        matchesPending: 2,
        totalPredictions: 40,
        predictionDistribution: [],
        winnersVerified: false,
        winnerCount: 0,
        averagePredictionsPerUser: 4,
        completionRate: 60,
        prizePool: '0',
        totalEntryFeesCollected: '0',
      };

      service.getEventStats.mockResolvedValue(mockStats);

      const result = await controller.getEventStats('event-1');

      expect(service.getEventStats).toHaveBeenCalledWith('event-1');
      expect(result).toEqual(mockStats);
    });
  });

  describe('getUserScore', () => {
    it('should call service with correct parameters', async () => {
      const mockScore: UserScoreResponseDto = {
        address: 'GUSER1',
        totalMatches: 10,
        totalPredictions: 8,
        correctPredictions: 6,
        incorrectPredictions: 2,
        pendingPredictions: 0,
        accuracyPercentage: 75,
        rank: 1,
        isWinner: false,
      };

      service.getUserScore.mockResolvedValue(mockScore);

      await controller.getUserScore('event-1', 'GUSER1');

      expect(service.getUserScore).toHaveBeenCalledWith('event-1', 'GUSER1');
    });

    it('should return user score from service', async () => {
      const mockScore: UserScoreResponseDto = {
        address: 'GUSER1',
        totalMatches: 10,
        totalPredictions: 8,
        correctPredictions: 6,
        incorrectPredictions: 2,
        pendingPredictions: 0,
        accuracyPercentage: 75,
        rank: 1,
        isWinner: false,
      };

      service.getUserScore.mockResolvedValue(mockScore);

      const result = await controller.getUserScore('event-1', 'GUSER1');

      expect(result).toEqual(mockScore);
    });
  });
});

describe('PublicCreatorEventsController', () => {
  let controller: PublicCreatorEventsController;
  let service: jest.Mocked<CreatorEventsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [PublicCreatorEventsController],
      providers: [
        {
          provide: CreatorEventsService,
          useValue: {
            getEventByInviteCode: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PublicCreatorEventsController>(
      PublicCreatorEventsController,
    );
    service = module.get(CreatorEventsService);
  });

  describe('getEventByInviteCode', () => {
    it('should call service with correct code', async () => {
      const mockEvent: EventByCodeResponseDto = {
        eventId: 'event-1',
        title: 'Test Event',
        description: 'Test Description',
        creator: 'GCREATOR',
        participantCount: 50,
        maxParticipants: 100,
        matchCount: 10,
        status: 'active',
        matchPreview: [],
        startTime: 1000000,
        endTime: 2000000,
      };

      service.getEventByInviteCode.mockResolvedValue(mockEvent);

      await controller.getEventByInviteCode('ABC123');

      expect(service.getEventByInviteCode).toHaveBeenCalledWith('ABC123');
    });

    it('should return event details from service', async () => {
      const mockEvent: EventByCodeResponseDto = {
        eventId: 'event-1',
        title: 'Test Event',
        description: 'Test Description',
        creator: 'GCREATOR',
        participantCount: 50,
        maxParticipants: 100,
        matchCount: 10,
        status: 'active',
        matchPreview: [
          {
            matchId: 'match-1',
            homeTeam: 'Team A',
            awayTeam: 'Team B',
            startTime: 1100000,
          },
        ],
        startTime: 1000000,
        endTime: 2000000,
      };

      service.getEventByInviteCode.mockResolvedValue(mockEvent);

      const result = await controller.getEventByInviteCode('ABC123');

      expect(result).toEqual(mockEvent);
      expect(result.matchPreview).toHaveLength(1);
    });
  });
});
