import { BroadcastQueueService } from './broadcast-queue.service';

/** Minimal fake of the socket.io Server surface BroadcastQueueService touches. */
const makeFakeServer = () => {
  const sockets = new Map<string, { emit: jest.Mock }>();
  return {
    sockets: { sockets },
    _addSocket: (id: string) => {
      const socket = { emit: jest.fn() };
      sockets.set(id, socket);
      return socket;
    },
  };
};

describe('BroadcastQueueService', () => {
  let service: BroadcastQueueService;

  beforeEach(() => {
    service = new BroadcastQueueService({
      get: (key: string) => {
        const values: Record<string, number> = {
          BROADCAST_QUEUE_MAX_SIZE: 3,
          BROADCAST_QUEUE_FLUSH_MS: 50,
        };
        return values[key];
      },
    } as never);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('coalesces messages sharing the same key, keeping only the latest payload', () => {
    const server = makeFakeServer();
    server._addSocket('socket-1');

    service.enqueue(
      server as never,
      'socket-1',
      'odds:market-1',
      'odds:update',
      {
        v: 1,
      },
    );
    service.enqueue(
      server as never,
      'socket-1',
      'odds:market-1',
      'odds:update',
      {
        v: 2,
      },
    );
    service.enqueue(
      server as never,
      'socket-1',
      'odds:market-1',
      'odds:update',
      {
        v: 3,
      },
    );

    expect(service.getQueueDepth('socket-1')).toBe(1);
    expect(service.getMetrics().coalesced).toBe(2);
  });

  it('drops the oldest non-coalescable message once the queue is at capacity', () => {
    const server = makeFakeServer();
    server._addSocket('socket-1');

    // maxQueueSize = 3; four distinct keys → one must be dropped.
    service.enqueue(server as never, 'socket-1', 'k1', 'ev', { v: 1 });
    service.enqueue(server as never, 'socket-1', 'k2', 'ev', { v: 2 });
    service.enqueue(server as never, 'socket-1', 'k3', 'ev', { v: 3 });
    service.enqueue(server as never, 'socket-1', 'k4', 'ev', { v: 4 });

    expect(service.getQueueDepth('socket-1')).toBe(3);
    expect(service.getMetrics().dropped).toBe(1);
  });

  it('flushes queued messages to the socket on the flush interval', () => {
    jest.useFakeTimers();
    const server = makeFakeServer();
    const socket = server._addSocket('socket-1');

    service.enqueue(server as never, 'socket-1', 'k1', 'odds:update', {
      v: 1,
    });
    expect(socket.emit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(60);

    expect(socket.emit).toHaveBeenCalledWith('odds:update', { v: 1 });
    expect(service.getQueueDepth('socket-1')).toBe(0);
    expect(service.getMetrics().sent).toBe(1);

    jest.useRealTimers();
  });

  it('a slow socket whose emit throws does not block delivery to other sockets', () => {
    jest.useFakeTimers();
    const server = makeFakeServer();
    const fastSocket = server._addSocket('fast');
    const slowSocket = server._addSocket('slow');

    // "Slow" socket: emit throws synchronously, simulating a stalled write
    // (e.g. the underlying transport rejecting a write). Each socket has
    // its own independent flush timer/queue — if broadcasting were still
    // done via a single synchronous loop over all room members, one
    // throwing socket would abort delivery to the rest in that same tick.
    slowSocket.emit.mockImplementation(() => {
      throw new Error('write buffer full');
    });

    service.enqueue(server as never, 'fast', 'k', 'ev', { v: 'fast' });
    service.enqueue(server as never, 'slow', 'k', 'ev', { v: 'slow' });

    jest.advanceTimersByTime(60);

    // fast's independent flush timer delivered its message even though
    // slow's flush (also fired this tick) threw.
    expect(fastSocket.emit).toHaveBeenCalledWith('ev', { v: 'fast' });

    jest.useRealTimers();
  });

  it('removeSocket clears the queue and stops its flush timer', () => {
    jest.useFakeTimers();
    const server = makeFakeServer();
    const socket = server._addSocket('socket-1');

    service.enqueue(server as never, 'socket-1', 'k1', 'ev', { v: 1 });
    service.removeSocket('socket-1');

    jest.advanceTimersByTime(200);

    expect(socket.emit).not.toHaveBeenCalled();
    expect(service.getQueueDepth('socket-1')).toBe(0);

    jest.useRealTimers();
  });

  it('enforces the configured buffer bound across many rapid enqueues', () => {
    const server = makeFakeServer();
    server._addSocket('socket-1');

    for (let i = 0; i < 50; i++) {
      service.enqueue(server as never, 'socket-1', `k${i}`, 'ev', { v: i });
    }

    expect(service.getQueueDepth('socket-1')).toBeLessThanOrEqual(3);
  });
});
