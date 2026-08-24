import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ContractPrediction,
  ContractService,
} from '../contract/contract.service';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { CreatorEventLeaderboardEntry } from '../matches/entities/creator-event-leaderboard-entry.entity';
import { CreatorEventPayout } from '../matches/entities/creator-event-payout.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchPrediction } from '../matches/entities/match-prediction.entity';
import { User } from '../users/entities/user.entity';
import { CreatorEventsService } from './creator-events.service';
import { SearchService } from '../search/search.service';

describe('CreatorEventsService predictions and stats', () => {
  let service: CreatorEventsService;
  let contractService: jest.Mocked<
    Pick<
      ContractService,
      | 'getEvent'
      | 'getEventMatches'
      | 'getUserPredictions'
      | 'getEventStatistics'
      | 'getEventParticipants'
      | 'getPredictionDistribution'
    >
  >;
  let creatorEventRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };

  const mockEvent = {
    eventId: '1',
    inviteCode: 'ABC',
    creator: 'GCREATOR',
    title: 'Test Event',
    description: 'Desc',
    startTime: 1_000_000,
    endTime: 2_000_000,
    maxParticipants: 100,
    participantCount: 3,
    isActive: true,
  };

  const mockMatches = [
    {
      matchId: '10',
      eventId: '1',
      homeTeam: 'Alpha',
      awayTeam: 'Beta',
      startTime: 1_100_000,
      resolved: true,
      outcome: 'TEAM_A',
    },
    {
      matchId: '11',
      eventId: '1',
      homeTeam: 'Gamma',
      awayTeam: 'Delta',
      startTime: 1_200_000,
      resolved: false,
      outcome: null,
    },
  ];

  beforeEach(async () => {
    contractService = {
      getEvent: jest.fn(),
      getEventMatches: jest.fn(),
      getUserPredictions: jest.fn(),
      getEventStatistics: jest.fn(),
      getEventParticipants: jest.fn(),
      getPredictionDistribution: jest.fn(),
    };

    creatorEventRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorEventsService,
        { provide: ContractService, useValue: contractService },
        {
          provide: SearchService,
          useValue: { searchCreatorEvents: jest.fn() },
        },
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: creatorEventRepository,
        },
        {
          provide: getRepositoryToken(CreatorEventLeaderboardEntry),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Match),
          useValue: {},
        },
        {
          provide: getRepositoryToken(MatchPrediction),
          useValue: {},
        },
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: getRepositoryToken(CreatorEventPayout),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CreatorEventsService>(CreatorEventsService);
  });

  describe('getUserPredictionsForEvent', () => {
    beforeEach(() => {
      contractService.getEvent.mockResolvedValue(mockEvent);
      contractService.getEventMatches.mockResolvedValue(mockMatches);
    });

    it('returns enriched predictions sorted by match time', async () => {
      contractService.getUserPredictions.mockResolvedValue([
        {
          prediction_id: 2,
          match_id: 11,
          predicted_outcome: 'DRAW',
          predicted_at: 1_050_000,
        },
        {
          prediction_id: 1,
          match_id: 10,
          predicted_outcome: 'TEAM_A',
          predicted_at: 1_040_000,
          is_correct: true,
        },
      ] as ContractPrediction[]);

      const result = await service.getUserPredictionsForEvent('1', 'GUSER');

      expect(result.address).toBe('GUSER');
      expect(result.predictions).toHaveLength(2);
      expect(result.predictions[0].matchId).toBe('10');
      expect(result.predictions[1].matchId).toBe('11');
      expect(result.predictions[0].isCorrect).toBe(true);
      expect(result.predictions[0].actualResult).toBe('TEAM_A');
      expect(result.predictions[1].isCorrect).toBeNull();
      expect(result.score).toEqual({
        totalPredictions: 2,
        correctPredictions: 1,
        accuracyPercentage: 100,
        matchesRemaining: 0,
      });
    });

    it('throws when event is not found', async () => {
      contractService.getEvent.mockResolvedValue(null);

      await expect(
        service.getUserPredictionsForEvent('999', 'GUSER'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEventStats', () => {
    beforeEach(() => {
      contractService.getEvent.mockResolvedValue(mockEvent);
      contractService.getEventMatches.mockResolvedValue(mockMatches);
      contractService.getEventStatistics.mockResolvedValue({
        eventId: '1',
        participantCount: 3,
        matchCount: 2,
        totalPredictions: 5,
        allMatchesResolved: false,
        winnersVerified: false,
        winnerCount: 0,
      });
      contractService.getEventParticipants.mockResolvedValue([
        { address: 'A', joinedAt: 1, predictionCount: 2 },
        { address: 'B', joinedAt: 2, predictionCount: 2 },
        { address: 'C', joinedAt: 3, predictionCount: 1 },
      ]);
      contractService.getPredictionDistribution
        .mockResolvedValueOnce({ teamA: 2, teamB: 1, draw: 0 })
        .mockResolvedValueOnce({ teamA: 0, teamB: 1, draw: 1 });
    });

    it('calculates event statistics with distribution and completion rate', async () => {
      creatorEventRepository.findOne.mockResolvedValue({
        prize_pool: '5010000000',
        total_entry_fees_collected: '10000000',
      });

      const result = await service.getEventStats('1');

      expect(result.totalParticipants).toBe(3);
      expect(result.totalMatches).toBe(2);
      expect(result.matchesResolved).toBe(1);
      expect(result.matchesPending).toBe(1);
      expect(result.totalPredictions).toBe(5);
      expect(result.predictionDistribution).toHaveLength(2);
      expect(result.predictionDistribution[0].total).toBe(3);
      expect(result.averagePredictionsPerUser).toBe(1.67);
      expect(result.completionRate).toBe(67);
      expect(result.winnersVerified).toBe(false);
      expect(result.prizePool).toBe('5010000000');
      expect(result.totalEntryFeesCollected).toBe('10000000');
    });

    it('defaults prize pool and entry fees to "0" when no cached event exists', async () => {
      creatorEventRepository.findOne.mockResolvedValue(null);

      const result = await service.getEventStats('1');

      expect(result.prizePool).toBe('0');
      expect(result.totalEntryFeesCollected).toBe('0');
    });

    it('throws when event is not found', async () => {
      contractService.getEvent.mockResolvedValue(null);

      await expect(service.getEventStats('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
