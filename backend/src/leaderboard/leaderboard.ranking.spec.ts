import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardService } from './leaderboard.service';
import { getRepositoryToken } from '@nestjs/typeorm';

/**
 * Leaderboard Ranking Accuracy Test Suite
 * Issue #2095: Validates correct ranking calculation and tie-breaking
 *
 * Ensures users are ranked correctly based on accuracy metrics,
 * with deterministic tie-breaking using timestamp or ID as secondary sort key.
 */
describe('LeaderboardService - Ranking Accuracy (#2095)', () => {
  let leaderboardService: LeaderboardService;

  const mockLeaderboardRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        {
          provide: getRepositoryToken(require('./entities/leaderboard-entry.entity').LeaderboardEntry),
          useValue: mockLeaderboardRepository,
        },
      ],
    }).compile();

    leaderboardService = module.get<LeaderboardService>(LeaderboardService);
  });

  describe('ranking with accuracy metric', () => {
    it('should rank users by prediction accuracy (higher is better)', async () => {
      const entries = [
        { userId: 'user-1', accuracy: 0.65, score: 1000 },
        { userId: 'user-2', accuracy: 0.78, score: 1500 },
        { userId: 'user-3', accuracy: 0.72, score: 1200 },
      ];

      mockLeaderboardRepository.find.mockResolvedValueOnce(entries);

      const ranked = await leaderboardService.getRankedEntries('lb-123');

      // User-2 has highest accuracy (0.78), should be rank 1
      expect(ranked[0].userId).toBe('user-2');
      expect(ranked[0].rank).toBe(1);

      // User-3 has 0.72 accuracy, should be rank 2
      expect(ranked[1].userId).toBe('user-3');
      expect(ranked[1].rank).toBe(2);

      // User-1 has lowest accuracy (0.65), should be rank 3
      expect(ranked[2].userId).toBe('user-1');
      expect(ranked[2].rank).toBe(3);
    });

    it('should use score as tiebreaker when accuracy is identical', async () => {
      const entries = [
        { userId: 'user-1', accuracy: 0.75, score: 2000, createdAt: new Date('2026-01-15') },
        { userId: 'user-2', accuracy: 0.75, score: 1500, createdAt: new Date('2026-01-16') },
        { userId: 'user-3', accuracy: 0.75, score: 1800, createdAt: new Date('2026-01-14') },
      ];

      mockLeaderboardRepository.find.mockResolvedValueOnce(entries);

      const ranked = await leaderboardService.getRankedEntries('lb-123');

      // All have same accuracy (0.75), ranked by score descending
      expect(ranked[0].userId).toBe('user-1'); // score 2000
      expect(ranked[0].rank).toBe(1);

      expect(ranked[1].userId).toBe('user-3'); // score 1800
      expect(ranked[1].rank).toBe(2);

      expect(ranked[2].userId).toBe('user-2'); // score 1500
      expect(ranked[2].rank).toBe(3);
    });

    it('should use creation timestamp as tertiary tiebreaker (earlier is better)', async () => {
      const entries = [
        {
          userId: 'user-1',
          accuracy: 0.75,
          score: 1500,
          createdAt: new Date('2026-01-15T10:00:00Z'),
        },
        {
          userId: 'user-2',
          accuracy: 0.75,
          score: 1500,
          createdAt: new Date('2026-01-15T09:00:00Z'),
        },
        {
          userId: 'user-3',
          accuracy: 0.75,
          score: 1500,
          createdAt: new Date('2026-01-15T11:00:00Z'),
        },
      ];

      mockLeaderboardRepository.find.mockResolvedValueOnce(entries);

      const ranked = await leaderboardService.getRankedEntries('lb-123');

      // All have same accuracy and score, ranked by createdAt ascending
      expect(ranked[0].userId).toBe('user-2'); // earliest
      expect(ranked[0].rank).toBe(1);

      expect(ranked[1].userId).toBe('user-1');
      expect(ranked[1].rank).toBe(2);

      expect(ranked[2].userId).toBe('user-3'); // latest
      expect(ranked[2].rank).toBe(3);
    });

    it('should handle accuracy differences with multiple decimal places', async () => {
      const entries = [
        { userId: 'user-1', accuracy: 0.7501, score: 1000 },
        { userId: 'user-2', accuracy: 0.7500, score: 1000 },
      ];

      mockLeaderboardRepository.find.mockResolvedValueOnce(entries);

      const ranked = await leaderboardService.getRankedEntries('lb-123');

      // Even tiny accuracy difference should be respected
      expect(ranked[0].userId).toBe('user-1'); // 0.7501 > 0.7500
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
    });
  });

  describe('rank assignment consistency', () => {
    it('should assign consecutive ranks (1, 2, 3, etc.) with no gaps', async () => {
      const entries = [
        { userId: 'user-1', accuracy: 0.80, rank: null },
        { userId: 'user-2', accuracy: 0.75, rank: null },
        { userId: 'user-3', accuracy: 0.70, rank: null },
        { userId: 'user-4', accuracy: 0.65, rank: null },
      ];

      mockLeaderboardRepository.find.mockResolvedValueOnce(entries);

      const ranked = await leaderboardService.getRankedEntries('lb-123');

      expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    });

    it('should return consistent results across multiple calls', async () => {
      const entries = [
        { userId: 'user-1', accuracy: 0.75, score: 1500 },
        { userId: 'user-2', accuracy: 0.75, score: 1500 },
      ];

      mockLeaderboardRepository.find.mockResolvedValueOnce(entries);
      const result1 = await leaderboardService.getRankedEntries('lb-123');

      mockLeaderboardRepository.find.mockResolvedValueOnce(entries);
      const result2 = await leaderboardService.getRankedEntries('lb-123');

      expect(result1[0].userId).toBe(result2[0].userId);
      expect(result1[1].userId).toBe(result2[1].userId);
    });
  });

  describe('edge cases', () => {
    it('should handle empty leaderboard', async () => {
      mockLeaderboardRepository.find.mockResolvedValueOnce([]);

      const ranked = await leaderboardService.getRankedEntries('lb-123');

      expect(ranked).toEqual([]);
    });

    it('should handle single entry leaderboard', async () => {
      const entries = [{ userId: 'user-1', accuracy: 0.50 }];

      mockLeaderboardRepository.find.mockResolvedValueOnce(entries);

      const ranked = await leaderboardService.getRankedEntries('lb-123');

      expect(ranked).toHaveLength(1);
      expect(ranked[0].rank).toBe(1);
    });

    it('should handle all users with zero accuracy', async () => {
      const entries = [
        { userId: 'user-1', accuracy: 0, score: 100, createdAt: new Date('2026-01-15') },
        { userId: 'user-2', accuracy: 0, score: 100, createdAt: new Date('2026-01-16') },
        { userId: 'user-3', accuracy: 0, score: 100, createdAt: new Date('2026-01-14') },
      ];

      mockLeaderboardRepository.find.mockResolvedValueOnce(entries);

      const ranked = await leaderboardService.getRankedEntries('lb-123');

      expect(ranked[0].userId).toBe('user-3'); // earliest timestamp
      expect(ranked[1].userId).toBe('user-1');
      expect(ranked[2].userId).toBe('user-2'); // latest timestamp
    });
  });
});
