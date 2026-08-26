import { SeasonRolloverScheduler } from './season-rollover.scheduler';
import { SeasonsService } from './seasons.service';

describe('SeasonRolloverScheduler', () => {
  let scheduler: SeasonRolloverScheduler;
  let seasonsService: { processSeasonRollover: jest.Mock };

  beforeEach(() => {
    seasonsService = {
      processSeasonRollover: jest.fn().mockResolvedValue({
        closedSeasonId: null,
        openedSeasonId: null,
        rewardsComputed: false,
        skipped: true,
      }),
    };
    scheduler = new SeasonRolloverScheduler(
      seasonsService as unknown as SeasonsService,
    );
  });

  it('invokes processSeasonRollover on tick', async () => {
    await scheduler.handleRolloverTick();
    expect(seasonsService.processSeasonRollover).toHaveBeenCalledTimes(1);
  });

  it('skips overlapping ticks while a run is in flight', async () => {
    let resolveRollover!: (value: unknown) => void;
    seasonsService.processSeasonRollover.mockReturnValue(
      new Promise((resolve) => {
        resolveRollover = resolve;
      }),
    );

    const first = scheduler.handleRolloverTick();
    const second = scheduler.handleRolloverTick();
    resolveRollover({
      closedSeasonId: null,
      openedSeasonId: null,
      rewardsComputed: false,
      skipped: true,
    });
    await Promise.all([first, second]);

    expect(seasonsService.processSeasonRollover).toHaveBeenCalledTimes(1);
  });

  it('does not swallow a failed rollover — the mutex releases so the next tick retries it', async () => {
    seasonsService.processSeasonRollover.mockRejectedValueOnce(
      new Error('payout failed'),
    );

    await scheduler.handleRolloverTick();
    await scheduler.handleRolloverTick();

    expect(seasonsService.processSeasonRollover).toHaveBeenCalledTimes(2);
  });
});
