import { BroadcastQueueService } from './broadcast-queue.service';

/** Minimal fake of the socket.io Server surface BroadcastQueueService touches. */
const makeFakeServer = () => {
  const sockets = new Map<
    string,
    { emit: jest.Mock; conn: { writeBuffer: unknown[] } }
  >();
  return {
    sockets: { sockets },
    _addSocket: (id: string) => {
      const socket = {
        emit: jest.fn(),
        conn: { writeBuffer: [] as unknown[] },
      };
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

  describe('backpressure', () => {
    /** Simulates a client whose transport isn't draining (default limit: 50). */
    const stall = (socket: { conn: { writeBuffer: unknown[] } }) => {
      socket.conn.writeBuffer = new Array(50).fill({});
    };

    it('keeps the queue bounded under sustained backpressure', () => {
      jest.useFakeTimers();
      const server = makeFakeServer();
      const socket = server._addSocket('slow');
      stall(socket);

      for (let i = 0; i < 500; i++) {
        service.enqueue(server as never, 'slow', `k${i}`, 'ev', { v: i });
        if (i % 10 === 0) jest.advanceTimersByTime(50);
        expect(service.getQueueDepth('slow')).toBeLessThanOrEqual(3);
      }

      // Nothing was pushed into the stalled transport's buffer.
      expect(socket.emit).not.toHaveBeenCalled();
      expect(service.getMetrics().deferred).toBeGreaterThan(0);
      expect(service.getMetrics().dropped).toBe(500 - 3);

      jest.useRealTimers();
    });

    it('applies the drop-oldest / coalesce policy when the queue is full', () => {
      jest.useFakeTimers();
      const server = makeFakeServer();
      const socket = server._addSocket('slow');
      stall(socket);

      service.enqueue(server as never, 'slow', 'k1', 'ev', { v: 1 });
      service.enqueue(server as never, 'slow', 'k2', 'ev', { v: 2 });
      service.enqueue(server as never, 'slow', 'k3', 'ev', { v: 3 });
      jest.advanceTimersByTime(50);

      // Full: a coalescable message replaces in place without dropping.
      service.enqueue(server as never, 'slow', 'k2', 'ev', { v: 22 });
      expect(service.getMetrics().dropped).toBe(0);
      expect(service.getMetrics().coalesced).toBe(1);

      // Full: a new key evicts the oldest queued message (k1).
      service.enqueue(server as never, 'slow', 'k4', 'ev', { v: 4 });
      expect(service.getMetrics().dropped).toBe(1);
      expect(service.getQueueDepth('slow')).toBe(3);

      // Transport drains → the surviving (latest) messages are delivered.
      socket.conn.writeBuffer = [];
      jest.advanceTimersByTime(50);

      expect(socket.emit.mock.calls).toEqual([
        ['ev', { v: 22 }],
        ['ev', { v: 3 }],
        ['ev', { v: 4 }],
      ]);

      jest.useRealTimers();
    });

    it('delivers every message under normal throughput', () => {
      jest.useFakeTimers();
      const server = makeFakeServer();
      const socket = server._addSocket('fast');

      for (let tick = 0; tick < 10; tick++) {
        for (let j = 0; j < 3; j++) {
          service.enqueue(server as never, 'fast', `k${tick}-${j}`, 'ev', {
            v: tick * 3 + j,
          });
        }
        jest.advanceTimersByTime(50);
      }

      expect(socket.emit).toHaveBeenCalledTimes(30);
      expect(socket.emit.mock.calls.map(([, p]) => p.v)).toEqual(
        Array.from({ length: 30 }, (_, i) => i),
      );
      expect(service.getMetrics().dropped).toBe(0);
      expect(service.getMetrics().sent).toBe(30);

      jest.useRealTimers();
    });
  });
});
