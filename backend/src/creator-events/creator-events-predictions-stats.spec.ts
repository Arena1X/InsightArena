import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ContractPrediction,
  ContractService,
} from '../contract/contract.service';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { CreatorEventsService } from './creator-events.service';

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
    prizePool: '5000000000',
    entryFee: '100000000',
    category: 'Sports',
    bannerUrl: 'https://example.com/banner.jpg',
    rewardDistribution: {
      rank1: 40,
      rank2: 30,
      rank3: 20,
      rank4: 5,
      rank5: 5,
    },
  };

  const mockMatches = [
    {
      matchId: '10',
      eventId: '1',
      homeTeam: 'Alpha',
      awayTeam: 'Beta',
      homeScore: 1,
      awayScore: 0,
      startTime: 1_100_000,
      resolved: true,
      outcome: 'TEAM_A',
    },
    {
      matchId: '11',
      eventId: '1',
      homeTeam: 'Gamma',
      awayTeam: 'Delta',
      homeScore: null,
      awayScore: null,
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorEventsService,
        { provide: ContractService, useValue: contractService },
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: { createQueryBuilder: jest.fn() },
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
      expect(result.prizePool).toBe('5000000000');
      expect(result.rewardDistribution).toEqual({
        rank1: 40,
        rank2: 30,
        rank3: 20,
        rank4: 5,
        rank5: 5,
      });
    });

    it('throws when event is not found', async () => {
      contractService.getEvent.mockResolvedValue(null);

      await expect(service.getEventStats('999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('includes prizePool and rewardDistribution in stats response', async () => {
      contractService.getEvent.mockResolvedValue(mockEvent);
      contractService.getEventStatistics.mockResolvedValue({
        eventId: '1',
        participantCount: 1,
        matchCount: 1,
        totalPredictions: 1,
        allMatchesResolved: false,
        winnersVerified: false,
        winnerCount: 0,
      });
      contractService.getEventParticipants.mockResolvedValue([]);
      contractService.getPredictionDistribution.mockResolvedValue({
        teamA: 0,
        teamB: 0,
        draw: 0,
      });

      const result = await service.getEventStats('1');

      expect(result.prizePool).toBe('5000000000');
      expect(result.rewardDistribution).toEqual({
        rank1: 40,
        rank2: 30,
        rank3: 20,
        rank4: 5,
        rank5: 5,
      });
    });
  });
});
