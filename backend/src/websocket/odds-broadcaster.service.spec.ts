import { OddsBroadcasterService } from './odds-broadcaster.service';
import { BroadcastQueueService } from './broadcast-queue.service';

describe('OddsBroadcasterService', () => {
  let service: OddsBroadcasterService;
  let broadcastQueue: jest.Mocked<Pick<BroadcastQueueService, 'enqueue'>>;
  let gateway: { server: unknown };

  const marketId = 'market-1';
  const room = `market:${marketId}`;

  beforeEach(() => {
    jest.useFakeTimers();

    const roomMembers = new Set(['socket-a', 'socket-b']);
    gateway = {
      server: {
        sockets: { adapter: { rooms: new Map([[room, roomMembers]]) } },
      },
    };

    broadcastQueue = { enqueue: jest.fn() };

    service = new OddsBroadcasterService(
      gateway as never,
      broadcastQueue as never,
      { get: () => 500 } as never,
    );

    service.onSubscribe(marketId);
    service.onSubscribe(marketId);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('enqueues the update on every subscribed socket individually instead of a room-wide emit', () => {
    service.broadcastOddsUpdate(marketId, [
      { outcome: 'Yes', count: 3, total_staked_stroops: '100' },
    ]);

    expect(broadcastQueue.enqueue).toHaveBeenCalledTimes(2);
    expect(broadcastQueue.enqueue).toHaveBeenCalledWith(
      gateway.server,
      'socket-a',
      `odds:${marketId}`,
      'odds:update',
      expect.objectContaining({ market_id: marketId }),
    );
    expect(broadcastQueue.enqueue).toHaveBeenCalledWith(
      gateway.server,
      'socket-b',
      `odds:${marketId}`,
      'odds:update',
      expect.objectContaining({ market_id: marketId }),
    );
  });

  it('does not enqueue anything when the market has no subscribers', () => {
    service.broadcastOddsUpdate('no-subscribers-market', [
      { outcome: 'Yes', count: 1, total_staked_stroops: '10' },
    ]);

    expect(broadcastQueue.enqueue).not.toHaveBeenCalled();
  });

  describe('throttling', () => {
    const odds = (count: number) => [
      { outcome: 'Yes', count, total_staked_stroops: String(count * 10) },
    ];

    /** Payloads enqueued for one socket, in order. */
    const deliveredTo = (socketId: string) =>
      broadcastQueue.enqueue.mock.calls
        .filter(([, id]) => id === socketId)
        .map(([, , , , payload]) => payload as { odds: { count: number }[] });

    it('coalesces rapid odds changes to at most one broadcast per throttle window', () => {
      // 40 changes, one every 50ms, over 2000ms with a 500ms window.
      for (let i = 1; i <= 40; i++) {
        service.broadcastOddsUpdate(marketId, odds(i));
        jest.advanceTimersByTime(50);
      }
      jest.advanceTimersByTime(500);

      // 2000ms of activity + trailing flush → at most one per window.
      const delivered = deliveredTo('socket-a');
      expect(delivered.length).toBeLessThanOrEqual(2000 / 500 + 1);
      expect(delivered.length).toBeGreaterThan(1);
    });

    it('never emits twice within a single throttle window', () => {
      const emitTimes: number[] = [];
      broadcastQueue.enqueue.mockImplementation((_server, socketId) => {
        if (socketId === 'socket-a') emitTimes.push(Date.now());
      });

      for (let i = 1; i <= 30; i++) {
        service.broadcastOddsUpdate(marketId, odds(i));
        jest.advanceTimersByTime(40);
      }
      jest.advanceTimersByTime(1000);

      for (let i = 1; i < emitTimes.length; i++) {
        expect(emitTimes[i] - emitTimes[i - 1]).toBeGreaterThanOrEqual(500);
      }
    });

    it('always delivers the final value of a throttle window', () => {
      service.broadcastOddsUpdate(marketId, odds(1));
      service.broadcastOddsUpdate(marketId, odds(2));
      service.broadcastOddsUpdate(marketId, odds(3));

      expect(deliveredTo('socket-a')).toHaveLength(1);

      jest.advanceTimersByTime(500);

      const delivered = deliveredTo('socket-a');
      expect(delivered).toHaveLength(2);
      expect(delivered[1].odds[0].count).toBe(3);
    });

    it('delivers an isolated change immediately', () => {
      service.broadcastOddsUpdate(marketId, odds(1));
      expect(deliveredTo('socket-a')).toHaveLength(1);

      // Quiet period longer than the window, then a single change.
      jest.advanceTimersByTime(2000);
      service.broadcastOddsUpdate(marketId, odds(2));

      const delivered = deliveredTo('socket-a');
      expect(delivered).toHaveLength(2);
      expect(delivered[1].odds[0].count).toBe(2);
    });
  });
});
