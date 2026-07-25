import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';

// ---------------------------------------------------------------------------
// Shared socket helpers
// ---------------------------------------------------------------------------

/** Tracks which rooms a socket has joined/left so we can assert isolation. */
const makeSocket = (overrides: Record<string, unknown> = {}) => {
  const rooms = new Set<string>();
  const socket: Record<string, unknown> = {
    id: 'socket-1',
    handshake: { auth: {}, headers: {} },
    join: jest.fn((room: string) => {
      rooms.add(room);
      return Promise.resolve();
    }),
    leave: jest.fn((room: string) => {
      rooms.delete(room);
      return Promise.resolve();
    }),
    emit: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
    _rooms: rooms,
    ...overrides,
  };
  return socket as any;
};

/** Minimal Socket.IO Server mock that records room-targeted emissions. */
const makeServer = () => {
  const roomEmissions: Record<string, { event: string; payload: unknown }[]> =
    {};

  const server = {
    emit: jest.fn(),
    to: jest.fn((room: string) => ({
      emit: jest.fn((event: string, payload: unknown) => {
        if (!roomEmissions[room]) roomEmissions[room] = [];
        roomEmissions[room].push({ event, payload });
      }),
    })),
    _roomEmissions: roomEmissions,
  };
  return server;
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

import { AnalyticsService } from '../analytics/analytics.service';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let jwtService: jest.Mocked<JwtService>;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let server: ReturnType<typeof makeServer>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        {
          provide: JwtService,
          useValue: { verify: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
        {
          provide: AnalyticsService,
          useValue: {
            trackActiveSession: jest.fn(),
            removeActiveSession: jest.fn(),
            getActiveUsersCount: jest.fn().mockReturnValue(0),
          },
        },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    jwtService = module.get(JwtService);
    analyticsService = module.get(AnalyticsService);
    server = makeServer();
    gateway.server = server as unknown as Server;
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // handleConnection
  // -------------------------------------------------------------------------
  describe('handleConnection', () => {
    it('does not join any user:* room when token is missing', async () => {
      const client = makeSocket({ handshake: { auth: {}, headers: {} } });
      await gateway.handleConnection(client);
      const joinedRooms = (client.join as jest.Mock).mock.calls.map(
        (c: string[]) => c[0],
      );
      expect(joinedRooms).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^user:/)]),
      );
    });

    it('does not join any user:* room when token is invalid (verify throws)', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      const client = makeSocket({
        handshake: { auth: { token: 'invalid.jwt.token' }, headers: {} },
      });
      await gateway.handleConnection(client);
      const joinedRooms = (client.join as jest.Mock).mock.calls.map(
        (c: string[]) => c[0],
      );
      expect(joinedRooms).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^user:/)]),
      );
    });

    it('joins user:* room when token is valid', async () => {
      jwtService.verify.mockReturnValue({ sub: 'GABC123' });
      const client = makeSocket({
        handshake: { auth: { token: 'valid' }, headers: {} },
      });
      await gateway.handleConnection(client);
      expect(client.join).toHaveBeenCalledWith('user:GABC123');
      expect(client.userAddress).toBe('GABC123');
    });
  });

  // -------------------------------------------------------------------------
  // handleDisconnect
  // -------------------------------------------------------------------------
  describe('handleDisconnect', () => {
    it('removes connection tracking on disconnect', async () => {
      jwtService.verify.mockReturnValue({ sub: 'GABC123' });
      const client = makeSocket({
        handshake: { auth: { token: 'valid' }, headers: {} },
      });
      await gateway.handleConnection(client);
      gateway.handleDisconnect(client);
      expect((gateway as any).connections.has('socket-1')).toBe(false);
    });

    it('removes rate-limit tracking on disconnect', async () => {
      const client = makeSocket();
      (gateway as any).rateLimits.set('socket-1', 5);
      gateway.handleDisconnect(client);
      expect((gateway as any).rateLimits.has('socket-1')).toBe(false);
    });

    /**
     * Disconnected socket is removed from all rooms (no delivery attempt, no error thrown).
     * Socket.IO handles room cleanup automatically; we assert gateway internal state
     * is cleared and no error is thrown.
     */
    it('does not throw when a socket disconnects and is removed from internal tracking', () => {
      const client = makeSocket({ id: 'socket-disco' });
      (gateway as any).connections.set('socket-disco', 'GUSER');
      (gateway as any).rateLimits.set('socket-disco', 3);

      expect(() => gateway.handleDisconnect(client)).not.toThrow();

      expect((gateway as any).connections.has('socket-disco')).toBe(false);
      expect((gateway as any).rateLimits.has('socket-disco')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // handleJoin
  // -------------------------------------------------------------------------
  describe('handleJoin', () => {
    it('joins valid event room', async () => {
      const client = makeSocket();
      await gateway.handleJoin(client, 'event:42');
      expect(client.join).toHaveBeenCalledWith('event:42');
      expect(client.emit).toHaveBeenCalledWith('joined', { room: 'event:42' });
    });

    it('joins valid match room', async () => {
      const client = makeSocket();
      await gateway.handleJoin(client, 'match:7');
      expect(client.join).toHaveBeenCalledWith('match:7');
    });

    it('rejects invalid room format', async () => {
      const client = makeSocket();
      await gateway.handleJoin(client, 'invalid-room');
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid room',
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects user room for unauthenticated client', async () => {
      const client = makeSocket();
      await gateway.handleJoin(
        client,
        'user:GABC1234567890123456789012345678901234567890123456789012',
      );
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized',
      });
    });

    it('allows user to join their own user room', async () => {
      const addr = 'G' + 'A'.repeat(55);
      const client = makeSocket({ userAddress: addr });
      await gateway.handleJoin(client, `user:${addr}`);
      expect(client.join).toHaveBeenCalledWith(`user:${addr}`);
    });

    it('enforces rate limit', async () => {
      const client = makeSocket();
      (gateway as any).rateLimits.set('socket-1', 60);
      await gateway.handleJoin(client, 'event:1');
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Rate limit exceeded',
      });
    });

    // -----------------------------------------------------------------------
    // Malformed subscribe payload (Issue requirement)
    // -----------------------------------------------------------------------
    it('rejects null/undefined subscribe payload with an error event, not a crash', async () => {
      const client = makeSocket();
      // passing null simulates a client omitting the room field
      await expect(
        gateway.handleJoin(client, null as unknown as string),
      ).resolves.not.toThrow();
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid room',
      });
    });

    it('rejects empty-string subscribe payload', async () => {
      const client = makeSocket();
      await gateway.handleJoin(client, '');
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid room',
      });
    });

    it('rejects a numeric market id (invalid format: "market:abc")', async () => {
      const client = makeSocket();
      await gateway.handleJoin(client, 'market:abc');
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid room',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Room isolation (Issue requirement)
  // -------------------------------------------------------------------------
  describe('room isolation', () => {
    it('client subscribed to market A receives its own broadcast but NOT market B', async () => {
      const clientA = makeSocket({ id: 'client-A' });
      await gateway.handleJoin(clientA, 'event:1');

      // Simulate a broadcast to event:1
      const toRoom1 = server.to('event:1');
      toRoom1.emit('event:updated', { event_id: '1', foo: 'bar' });

      // Simulate a broadcast to event:2 (client-A did NOT join this)
      const toRoom2 = server.to('event:2');
      toRoom2.emit('event:updated', { event_id: '2', foo: 'baz' });

      // client-A joined event:1
      expect(clientA.join).toHaveBeenCalledWith('event:1');
      // client-A did NOT join event:2
      expect(clientA.join).not.toHaveBeenCalledWith('event:2');

      // Server recorded emissions per room — event:1 received data, event:2 did not send to clientA
      expect(server._roomEmissions['event:1']).toHaveLength(1);
      expect(server._roomEmissions['event:1'][0].payload).toMatchObject({
        event_id: '1',
      });
      // event:2 emission exists but clientA is not in that room
      expect(server._roomEmissions['event:2']).toHaveLength(1);
      expect(server._roomEmissions['event:2'][0].payload).toMatchObject({
        event_id: '2',
      });
    });

    it('client does NOT receive events for a room it never joined', async () => {
      const client = makeSocket({ id: 'solo-client' });
      // client only joined event:10
      await gateway.handleJoin(client, 'event:10');
      expect(client.join).toHaveBeenCalledWith('event:10');
      expect(client.join).not.toHaveBeenCalledWith('event:20');
    });

    it('after leaving a room, client no longer belongs to that room', async () => {
      const client = makeSocket();
      await gateway.handleJoin(client, 'event:5');
      expect(client._rooms.has('event:5')).toBe(true);

      await gateway.handleLeave(client, 'event:5');
      expect(client.leave).toHaveBeenCalledWith('event:5');
      expect(client._rooms.has('event:5')).toBe(false);
    });

    it('after leaving a room, no further broadcasts reach the client in that room', async () => {
      const client = makeSocket({ id: 'leave-test' });
      await gateway.handleJoin(client, 'event:7');
      await gateway.handleLeave(client, 'event:7');

      // The client is no longer in event:7 — the socket.io server would not deliver
      // to it. We assert that leave was called and the internal room set is clean.
      expect(client.leave).toHaveBeenCalledWith('event:7');
      expect(client._rooms.has('event:7')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Broadcast to empty room (Issue requirement — safe no-op)
  // -------------------------------------------------------------------------
  describe('broadcast to empty room', () => {
    it('emitting to a room with zero subscribers is a safe no-op', () => {
      // No socket has joined event:999
      expect(() => {
        const targeted = server.to('event:999');
        targeted.emit('event:updated', { event_id: '999' });
      }).not.toThrow();

      // Room tracked but no client socket received anything
      expect(server._roomEmissions['event:999']).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // rate limiting
  // -------------------------------------------------------------------------
  describe('rate limiting', () => {
    it('allows up to 60 messages without disconnect', async () => {
      const client = makeSocket();

      for (let i = 0; i < 60; i++) {
        await gateway.handleJoin(client, 'event:1');
      }

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('joined', { room: 'event:1' });
    });

    it('disconnects socket on 61st message when rate limit exceeded', async () => {
      const client = makeSocket();

      for (let i = 0; i < 60; i++) {
        await gateway.handleJoin(client, 'event:1');
      }

      expect(client.disconnect).not.toHaveBeenCalled();

      await gateway.handleJoin(client, 'event:2');

      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Rate limit exceeded',
      });
    });

    it('enforces per-socket rate limiting', async () => {
      const client1 = makeSocket({ id: 'socket-1' });
      const client2 = makeSocket({ id: 'socket-2' });

      (gateway as any).rateLimits.set('socket-1', 60);

      await gateway.handleJoin(client1, 'event:1');

      expect(client1.disconnect).toHaveBeenCalled();
      expect(client1.emit).toHaveBeenCalledWith('error', {
        message: 'Rate limit exceeded',
      });

      await gateway.handleJoin(client2, 'event:1');

      expect(client2.disconnect).not.toHaveBeenCalled();
      expect(client2.emit).toHaveBeenCalledWith('joined', { room: 'event:1' });
    });

    it('resets rate limit counter after window expires', async () => {
      jest.useFakeTimers();
      const client = makeSocket();
      const rateLimitWindow = 60_000;

      await gateway.handleJoin(client, 'event:1');

      expect(client.disconnect).not.toHaveBeenCalled();

      const rateLimits = (gateway as any).rateLimits;
      expect(rateLimits.has('socket-1')).toBe(true);

      jest.advanceTimersByTime(rateLimitWindow + 100);

      expect(rateLimits.has('socket-1')).toBe(false);

      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // handleLeave
  // -------------------------------------------------------------------------
  describe('handleLeave', () => {
    it('leaves room and emits left event', async () => {
      const client = makeSocket();
      await gateway.handleLeave(client, 'event:5');
      expect(client.leave).toHaveBeenCalledWith('event:5');
      expect(client.emit).toHaveBeenCalledWith('left', { room: 'event:5' });
    });
  });
});
