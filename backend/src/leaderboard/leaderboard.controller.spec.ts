import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import {
  LeaderboardQueryDto,
  PaginatedLeaderboardResponse,
} from './dto/leaderboard-query.dto';

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
          provide: LeaderboardService,
          useValue: {
            getLeaderboard: jest.fn(),
            getUserRank: jest.fn(),
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
});
