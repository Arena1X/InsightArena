import {
  Inject,
  Logger,
  OnModuleDestroy,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OddsBroadcasterService } from './odds-broadcaster.service';
import { BroadcastQueueService } from './broadcast-queue.service';

interface AuthenticatedSocket extends Socket {
  userAddress?: string;
}

interface JwtHandshakePayload {
  sub: string;
  stellar_address: string;
}

/** UUID v4 pattern used to validate market room subscriptions. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** In-memory snapshot of an authenticated client's subscriptions, keyed by session id. */
interface SessionSnapshot {
  userAddress: string;
  rooms: Set<string>;
  markets: Set<string>;
}

/** How long a session's subscriptions are retained after disconnect, to allow reconnect resume. */
const SESSION_RETENTION_MS = 5 * 60_000;

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/ws',
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private readonly connections = new Map<string, string>(); // socketId → userAddress
  private readonly rateLimits = new Map<string, number>(); // socketId → message count
  private readonly heartbeats = new Map<string, NodeJS.Timeout>();
  /** Tracks which market rooms each socket has subscribed to for cleanup on disconnect. */
  private readonly socketMarkets = new Map<string, Set<string>>(); // socketId → Set<marketId>
  /** socketId → sessionId, so disconnect can snapshot subscriptions under a stable key. */
  private readonly socketSessions = new Map<string, string>();
  /** sessionId → last-known subscriptions, retained briefly to resume after reconnect. */
  private readonly sessions = new Map<string, SessionSnapshot>();
  private readonly sessionExpiry = new Map<string, NodeJS.Timeout>();
  private readonly RATE_LIMIT = 60; // messages per minute
  private readonly RATE_WINDOW = 60_000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analyticsService: AnalyticsService,
    @Optional() private readonly oddsBroadcaster?: OddsBroadcasterService,
    @Optional() private readonly broadcastQueue?: BroadcastQueueService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization as string)?.replace(
        'Bearer ',
        '',
      );

    if (!token) {
      this.logger.warn(`Rejecting unauthenticated handshake: ${client.id}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }

    let payload: JwtHandshakePayload;
    try {
      payload = this.jwtService.verify<JwtHandshakePayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      this.logger.warn(`Rejecting invalid handshake token: ${client.id}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }

    const userAddress = payload.stellar_address;
    client.userAddress = userAddress;
    this.connections.set(client.id, userAddress);
    await client.join(`user:${userAddress}`);
    this.logger.log(`Client connected: ${client.id} (${userAddress})`);

    // Resume subscriptions from a prior connection, if the client presents
    // the session id it was issued on a previous handshake.
    const requestedSessionId = client.handshake.auth?.sessionId as
      | string
      | undefined;
    const sessionId = await this.resolveSession(
      client,
      userAddress,
      requestedSessionId,
    );
    client.emit('session', { sessionId });

    // Heartbeat
    // In Jest/unit test runs we don't want to keep background intervals alive,
    // which can cause test processes to hang until CI timeout.
    const isTestRun =
      process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);

    if (!isTestRun) {
      const heartbeat = setInterval(() => {
        client.emit('ping');
      }, 25_000);
      heartbeat.unref?.();
      this.clearHeartbeat(client.id);
      this.heartbeats.set(client.id, heartbeat);

      client.on('pong', () => {
        this.trackActivity(client);
        this.logger.debug(`Pong from ${client.id}`);
      });

      client.on('disconnect', () => this.clearHeartbeat(client.id));
    }

    this.trackActivity(client);
  }

  /**
   * Resolves the session id for a freshly authenticated socket. If the
   * client presents a `sessionId` from a prior connection that belongs to
   * the same authenticated user and hasn't expired, its previously tracked
   * rooms/markets are rejoined. Otherwise a new session id is minted.
   */
  private async resolveSession(
    client: AuthenticatedSocket,
    userAddress: string,
    requestedSessionId?: string,
  ): Promise<string> {
    const existing = requestedSessionId
      ? this.sessions.get(requestedSessionId)
      : undefined;

    if (existing && existing.userAddress === userAddress) {
      const expiry = this.sessionExpiry.get(requestedSessionId!);
      if (expiry) {
        clearTimeout(expiry);
        this.sessionExpiry.delete(requestedSessionId!);
      }

      for (const room of existing.rooms) {
        await client.join(room);
      }
      if (existing.markets.size > 0) {
        this.socketMarkets.set(client.id, new Set(existing.markets));
        for (const marketId of existing.markets) {
          await client.join(`market:${marketId}`);
          this.oddsBroadcaster?.onSubscribe(marketId);
        }
      }

      this.sessions.delete(requestedSessionId!);
      this.socketSessions.set(client.id, requestedSessionId!);
      this.logger.log(
        `Resumed session ${requestedSessionId} for ${client.id}: ${existing.rooms.size} room(s), ${existing.markets.size} market(s)`,
      );
      return requestedSessionId!;
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.socketSessions.set(client.id, sessionId);
    return sessionId;
  }

  /** Rooms currently joined by this socket, excluding its own default/user room bookkeeping. */
  private getTrackedRooms(client: AuthenticatedSocket): Set<string> {
    const rooms = new Set(client.rooms ?? []);
    rooms.delete(client.id);
    return rooms;
  }

  private trackActivity(client: AuthenticatedSocket): void {
    this.analyticsService.trackActiveSession(client.id);
    this.broadcastActiveUsers();
  }

  private broadcastActiveUsers(): void {
    const count = this.analyticsService.getActiveUsersCount();
    this.server.emit('analytics:active-users', { count });
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.clearHeartbeat(client.id);
    this.rateLimits.delete(client.id);
    this.analyticsService.removeActiveSession(client.id);
    this.broadcastActiveUsers();
    this.broadcastQueue?.removeSocket(client.id);

    const userAddress = this.connections.get(client.id);
    this.connections.delete(client.id);

    // Unsubscribe the socket from all market rooms it had joined.
    const markets = this.socketMarkets.get(client.id);
    if (markets) {
      for (const marketId of markets) {
        this.oddsBroadcaster?.onUnsubscribe(marketId);
      }
      this.socketMarkets.delete(client.id);
    }

    // Snapshot this session's subscriptions so a reconnect can resume them.
    const sessionId = this.socketSessions.get(client.id);
    if (sessionId && userAddress) {
      this.sessions.set(sessionId, {
        userAddress,
        rooms: this.getTrackedRooms(client),
        markets: markets ?? new Set(),
      });
      const expiry = setTimeout(() => {
        this.sessions.delete(sessionId);
        this.sessionExpiry.delete(sessionId);
      }, SESSION_RETENTION_MS);
      expiry.unref?.();
      this.sessionExpiry.set(sessionId, expiry);
    }
    this.socketSessions.delete(client.id);

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  onModuleDestroy(): void {
    for (const heartbeat of this.heartbeats.values()) {
      clearInterval(heartbeat);
    }
    this.heartbeats.clear();
    this.socketMarkets.clear();
    for (const expiry of this.sessionExpiry.values()) {
      clearTimeout(expiry);
    }
    this.sessionExpiry.clear();
    this.sessions.clear();
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() room: string,
  ): Promise<void> {
    if (!this.checkRateLimit(client.id)) {
      client.emit('error', { message: 'Rate limit exceeded' });
      client.disconnect();
      return;
    }

    // Validate room format
    if (
      !room ||
      (!/^(event|match):\d+$/.test(room) && !/^user:[A-Z0-9]{56}$/.test(room))
    ) {
      client.emit('error', { message: 'Invalid room' });
      return;
    }

    // User rooms require authentication
    if (room.startsWith('user:') && client.userAddress !== room.split(':')[1]) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    await client.join(room);
    client.emit('joined', { room });
    this.logger.debug(`${client.id} joined ${room}`);
    this.trackActivity(client);
  }

  @SubscribeMessage('leave')
  async handleLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() room: string,
  ): Promise<void> {
    await client.leave(room);
    client.emit('left', { room });
    this.trackActivity(client);
  }

  @SubscribeMessage('notification:delivered')
  handleNotificationDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { notification_id: number },
  ): void {
    if (!client.userAddress) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }
    // Emit event for notification broadcaster to handle
    this.server.emit('internal:notification:confirmed', {
      user_address: client.userAddress,
      notification_id: data.notification_id,
    });
    this.trackActivity(client);
  }

  private checkRateLimit(socketId: string): boolean {
    const count = this.rateLimits.get(socketId) ?? 0;
    if (count >= this.RATE_LIMIT) return false;
    this.rateLimits.set(socketId, count + 1);
    if (count === 0) {
      const timeout = setTimeout(
        () => this.rateLimits.delete(socketId),
        this.RATE_WINDOW,
      );
      timeout.unref?.();
    }
    return true;
  }

  private clearHeartbeat(socketId: string): void {
    const heartbeat = this.heartbeats.get(socketId);
    if (!heartbeat) return;
    clearInterval(heartbeat);
    this.heartbeats.delete(socketId);
  }

  // ---------------------------------------------------------------------------
  // Live odds subscription handlers (#1361)
  // ---------------------------------------------------------------------------

  /**
   * Join a per-market odds room.
   *
   * Client sends: `{ event: 'subscribe:market', data: '<market-uuid>' }`
   * Server responds with: `{ event: 'subscribed:market', data: { market_id } }`
   * and starts delivering `odds:update` events to the room.
   */
  @SubscribeMessage('subscribe:market')
  async handleSubscribeMarket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() marketId: string,
  ): Promise<void> {
    if (!this.checkRateLimit(client.id)) {
      client.emit('error', { message: 'Rate limit exceeded' });
      client.disconnect();
      return;
    }

    if (!marketId || !UUID_RE.test(marketId)) {
      client.emit('error', { message: 'Invalid market id' });
      return;
    }

    const room = `market:${marketId}`;
    await client.join(room);

    // Track this subscription on the socket for disconnect cleanup.
    if (!this.socketMarkets.has(client.id)) {
      this.socketMarkets.set(client.id, new Set());
    }
    const markets = this.socketMarkets.get(client.id)!;

    // Only register with the broadcaster once per socket per market.
    if (!markets.has(marketId)) {
      markets.add(marketId);
      this.oddsBroadcaster?.onSubscribe(marketId);
    }

    client.emit('subscribed:market', { market_id: marketId });
    this.logger.debug(`${client.id} subscribed to market:${marketId}`);
    this.trackActivity(client);
  }

  /**
   * Leave a per-market odds room.
   *
   * Client sends: `{ event: 'unsubscribe:market', data: '<market-uuid>' }`
   * Server responds with: `{ event: 'unsubscribed:market', data: { market_id } }`
   */
  @SubscribeMessage('unsubscribe:market')
  async handleUnsubscribeMarket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() marketId: string,
  ): Promise<void> {
    if (!marketId || !UUID_RE.test(marketId)) {
      client.emit('error', { message: 'Invalid market id' });
      return;
    }

    const room = `market:${marketId}`;
    await client.leave(room);

    const markets = this.socketMarkets.get(client.id);
    if (markets?.has(marketId)) {
      markets.delete(marketId);
      this.oddsBroadcaster?.onUnsubscribe(marketId);
      if (markets.size === 0) {
        this.socketMarkets.delete(client.id);
      }
    }

    client.emit('unsubscribed:market', { market_id: marketId });
    this.logger.debug(`${client.id} unsubscribed from market:${marketId}`);
    this.trackActivity(client);
  }

  getServer(): Server {
    return this.server;
  }
}
