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
});
