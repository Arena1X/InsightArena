import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';

const mockServer = {
  emit: jest.fn(),
  to: jest.fn().mockReturnThis(),
};

const makeSocket = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'socket-1',
    handshake: { auth: {}, headers: {} },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    ...overrides,
  }) as any;

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let jwtService: jest.Mocked<JwtService>;

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
      ],
    }).compile();

    gateway = module.get(EventsGateway);
    jwtService = module.get(JwtService);
    (gateway as any).server = mockServer;
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleConnection', () => {
    it('joins user room when token is valid', async () => {
      jwtService.verify.mockReturnValue({ sub: 'GABC123' });
      const client = makeSocket({ handshake: { auth: { token: 'valid' }, headers: {} } });
      await gateway.handleConnection(client);
      expect(client.join).toHaveBeenCalledWith('user:GABC123');
      expect(client.userAddress).toBe('GABC123');
    });

    it('connects without auth when no token provided', async () => {
      const client = makeSocket();
      await gateway.handleConnection(client);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('connects unauthenticated when token is invalid', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('invalid'); });
      const client = makeSocket({ handshake: { auth: { token: 'bad' }, headers: {} } });
      await gateway.handleConnection(client);
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('removes connection tracking on disconnect', async () => {
      jwtService.verify.mockReturnValue({ sub: 'GABC123' });
      const client = makeSocket({ handshake: { auth: { token: 'valid' }, headers: {} } });
      await gateway.handleConnection(client);
      gateway.handleDisconnect(client);
      expect((gateway as any).connections.has('socket-1')).toBe(false);
    });
  });

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
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid room' });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects user room for unauthenticated client', async () => {
      const client = makeSocket();
      await gateway.handleJoin(client, 'user:GABC1234567890123456789012345678901234567890123456789012');
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Unauthorized' });
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
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Rate limit exceeded' });
    });
  });

  describe('handleLeave', () => {
    it('leaves room and emits left event', async () => {
      const client = makeSocket();
      await gateway.handleLeave(client, 'event:5');
      expect(client.leave).toHaveBeenCalledWith('event:5');
      expect(client.emit).toHaveBeenCalledWith('left', { room: 'event:5' });
    });
  });
});
