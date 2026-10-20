import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import {
  LeaderboardEntryResponse,
  LeaderboardQueryDto,
  PaginatedLeaderboardResponse,
} from './dto/leaderboard-query.dto';
import { CoachInsightsResponse } from './dto/coach-insights.dto';
import { User } from '../users/entities/user.entity';

describe('LeaderboardController', () => {
  let controller: LeaderboardController;
  let service: LeaderboardService;

  const mockResponse: PaginatedLeaderboardResponse = {
    data: [
      {
        rank: 1,
        user_id: 'user-uuid-1',
        username: 'testuser',
        stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        reputation_score: 100,
        accuracy_rate: '70.0',
        total_winnings_stroops: '500000',
        season_points: 50,
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaderboardController],
      providers: [
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: LeaderboardService,
          useValue: {
            getTopLeaderboard: jest.fn(),
            getLeaderboard: jest.fn(),
            getLeaderboardCursor: jest.fn(),
            getUserRank: jest.fn(),
            getHistory: jest.fn(),
            getHistoryForAddress: jest.fn(),
            getRankHistory: jest.fn(),
            getSnapshots: jest.fn(),
            getCoachInsights: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LeaderboardController>(LeaderboardController);
    service = module.get<LeaderboardService>(LeaderboardService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLeaderboard', () => {
    it('should return paginated leaderboard', async () => {
      const spy = jest
        .spyOn(service, 'getLeaderboard')
        .mockResolvedValue(mockResponse);
      const query: LeaderboardQueryDto = { page: 1, limit: 20 };

      const result = await controller.getLeaderboard(query);

      expect(spy).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResponse);
    });

    it('should pass season_id to service when provided', async () => {
      const spy = jest
        .spyOn(service, 'getLeaderboard')
        .mockResolvedValue(mockResponse);
      const query: LeaderboardQueryDto = {
        page: 1,
        limit: 20,
        season_id: 'season-1',
      };

      await controller.getLeaderboard(query);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ season_id: 'season-1' }),
      );
    });

    it('delegates to getLeaderboardCursor when a cursor query param is present', async () => {
      const cursorSpy = jest
        .spyOn(service, 'getLeaderboardCursor')
        .mockResolvedValue({
          data: [],
          nextCursor: null,
          hasMore: false,
          limit: 20,
        });
      const offsetSpy = jest.spyOn(service, 'getLeaderboard');
      const query: LeaderboardQueryDto = { cursor: 'abc', limit: 20 };

      await controller.getLeaderboard(query);

      expect(cursorSpy).toHaveBeenCalledWith(query);
      expect(offsetSpy).not.toHaveBeenCalled();
    });

    it('delegates to getLeaderboard (offset) when no cursor is present', async () => {
      const offsetSpy = jest
        .spyOn(service, 'getLeaderboard')
        .mockResolvedValue(mockResponse);
      const cursorSpy = jest.spyOn(service, 'getLeaderboardCursor');
      const query: LeaderboardQueryDto = { page: 1, limit: 20 };

      await controller.getLeaderboard(query);

      expect(offsetSpy).toHaveBeenCalledWith(query);
      expect(cursorSpy).not.toHaveBeenCalled();
    });
  });

  describe('getTopLeaderboard', () => {
    it('should return top N leaderboard entries', async () => {
      const mockTop: LeaderboardEntryResponse[] = [mockResponse.data[0]];
      const spy = jest
        .spyOn(service, 'getTopLeaderboard')
        .mockResolvedValue(mockTop);

      const result = await controller.getTopLeaderboard(1);

      expect(spy).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockTop);
    });
  });

  describe('getHistory', () => {
    it('should return history for a specific address when provided', async () => {
      const mockHistory = [
        {
          snapshot_date: new Date(),
          rank: 5,
          reputation_score: 150,
          season_points: 20,
        },
      ];
      const spy = jest
        .spyOn(service, 'getHistoryForAddress' as any)
        .mockResolvedValue(mockHistory);

      const result = await controller.getHistory({
        address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        days: 30,
      });

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        30,
        undefined,
        undefined,
      );
      expect(result).toEqual(mockHistory);
    });

    it('should return 404 when address is not found in history', async () => {
      jest
        .spyOn(service, 'getHistoryForAddress' as any)
        .mockRejectedValue({ status: 404 });

      await expect(
        controller.getHistory({ address: 'NON_EXISTENT' }),
      ).rejects.toBeDefined();
    });

    it('should use default days (30) if not provided for address search', async () => {
      const spy = jest
        .spyOn(service, 'getHistoryForAddress' as any)
        .mockResolvedValue([]);

      await controller.getHistory({
        address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      });

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('getUserRank', () => {
    it('should return user rank by stellar address', async () => {
      const mockUserRank = {
        rank: 1,
        reputation_score: 100,
        season_points: 50,
        total_predictions: 10,
        correct_predictions: 7,
        accuracy_rate: '70.0',
        total_winnings_stroops: '500000',
      };

      const spy = jest
        .spyOn(service, 'getUserRank')
        .mockResolvedValue(mockUserRank);

      const result = await controller.getUserRank(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      );

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      );
      expect(result).toEqual(mockUserRank);
    });

    it('should throw NotFoundException for unknown address', async () => {
      const spy = jest
        .spyOn(service, 'getUserRank')
        .mockRejectedValue(new Error('User not found'));

      await expect(controller.getUserRank('INVALID_ADDRESS')).rejects.toThrow();
      expect(spy).toHaveBeenCalledWith('INVALID_ADDRESS');
    });
  });

  describe('getRankHistory', () => {
    it('should return rank history for a stellar address', async () => {
      const mockRankHistory = {
        user_id: 'user-uuid-1',
        data: [
          { captured_at: new Date(), rank: 3, score: 100, rank_delta: null },
        ],
      };
      const spy = jest
        .spyOn(service, 'getRankHistory')
        .mockResolvedValue(mockRankHistory);

      const result = await controller.getRankHistory(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        {},
      );

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        {},
      );
      expect(result).toEqual(mockRankHistory);
    });

    it('should propagate NotFoundException for unknown address', async () => {
      jest
        .spyOn(service, 'getRankHistory')
        .mockRejectedValue(new Error('User not found'));

      await expect(
        controller.getRankHistory('INVALID_ADDRESS', {}),
      ).rejects.toThrow();
    });
  });

  describe('getSnapshots', () => {
    it('should return snapshot rankings for a given date', async () => {
      const mockSnapshotResponse = {
        data: [
          {
            rank: 1,
            user_id: 'user-uuid-1',
            username: 'testuser',
            stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
            score: 100,
            captured_at: new Date('2026-07-01T12:00:00Z'),
          },
        ],
        snapshot_date: new Date('2026-07-01T12:00:00Z'),
        total: 1,
        page: 1,
        limit: 20,
      };
      const spy = jest
        .spyOn(service, 'getSnapshots')
        .mockResolvedValue(mockSnapshotResponse);

      const result = await controller.getSnapshots({ date: '2026-07-15' });

      expect(spy).toHaveBeenCalledWith({ date: '2026-07-15' });
      expect(result).toEqual(mockSnapshotResponse);
    });

    it('should return a message when no snapshots exist', async () => {
      const mockEmptyResponse = {
        data: [],
        snapshot_date: new Date('2026-01-01'),
        total: 0,
        page: 1,
        limit: 20,
        message: 'No snapshots found on or before 2026-01-01.',
      };
      jest.spyOn(service, 'getSnapshots').mockResolvedValue(mockEmptyResponse);

      const result = await controller.getSnapshots({ date: '2026-01-01' });

      expect(result.data).toEqual([]);
      expect(result.message).toContain('No snapshots found');
    });
  });

  describe('getCoachInsights', () => {
    const coachUser = { id: 'user-uuid-1' } as User;

    it('should return tailored insights scoped to the authenticated user', async () => {
      const insightsResponse: CoachInsightsResponse = {
        has_history: true,
        message: null,
        insights: {
          accuracy_trend: {
            direction: 'improving',
            recent_accuracy: 80,
            prior_accuracy: 50,
          },
          best_category: {
            category: 'Crypto',
            predictions: 5,
            correct: 4,
            accuracy_rate: '80.0',
          },
          worst_category: null,
          current_streak: 3,
          longest_streak: 5,
          total_resolved: 12,
          generated_at: new Date('2026-08-19T10:00:00Z').toISOString(),
        },
      };
      const spy = jest
        .spyOn(service, 'getCoachInsights')
        .mockResolvedValue(insightsResponse);

      const result = await controller.getCoachInsights(coachUser);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(coachUser);
      expect(result.has_history).toBe(true);
      expect(result.insights?.best_category?.category).toBe('Crypto');
    });

    it('should pass through the new-user shape unchanged', async () => {
      const onboardingResponse: CoachInsightsResponse = {
        has_history: false,
        message:
          'Make a few more predictions to unlock your personalised coach insights.',
        insights: null,
      };
      jest
        .spyOn(service, 'getCoachInsights')
        .mockResolvedValue(onboardingResponse);

      const result = await controller.getCoachInsights(coachUser);

      expect(result.has_history).toBe(false);
      expect(result.insights).toBeNull();
      expect(result.message).toContain('predictions');
    });
  });
});
