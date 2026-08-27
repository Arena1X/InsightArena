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
});
