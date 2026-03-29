import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardScheduler } from './leaderboard.scheduler';
import { LeaderboardService } from './leaderboard.service';

describe('LeaderboardScheduler', () => {
  let scheduler: LeaderboardScheduler;
  let service: LeaderboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardScheduler,
        {
          provide: LeaderboardService,
          useValue: {
            recalculateRanks: jest.fn(),
          },
        },
      ],
    }).compile();

    scheduler = module.get<LeaderboardScheduler>(LeaderboardScheduler);
    service = module.get<LeaderboardService>(LeaderboardService);
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  describe('handleHourlyRecalculation', () => {
    it('should call recalculateRanks', async () => {
      const spy = jest.spyOn(service, 'recalculateRanks').mockResolvedValue();

      await scheduler.handleHourlyRecalculation();

      expect(spy).toHaveBeenCalled();
    });

    it('should not throw if recalculateRanks fails', async () => {
      jest
        .spyOn(service, 'recalculateRanks')
        .mockRejectedValue(new Error('DB error'));

      await expect(
        scheduler.handleHourlyRecalculation(),
      ).resolves.not.toThrow();
    });
  });
});
