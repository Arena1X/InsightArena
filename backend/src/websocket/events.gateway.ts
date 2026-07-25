import { Inject, Logger, OnModuleDestroy, forwardRef } from '@nestjs/common';
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

interface AuthenticatedSocket extends Socket {
  userAddress?: string;
}

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
  private readonly RATE_LIMIT = 60; // messages per minute
  private readonly RATE_WINDOW = 60_000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analyticsService: AnalyticsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization as string)?.replace(
        'Bearer ',
        '',
      );

    if (token) {
      try {
        const payload = this.jwtService.verify<{ sub: string }>(token, {
          secret: this.configService.get<string>('JWT_SECRET'),
        });
        client.userAddress = payload.sub;
        this.connections.set(client.id, payload.sub);
        await client.join(`user:${payload.sub}`);
        this.logger.log(`Client connected: ${client.id} (${payload.sub})`);
      } catch {
        this.logger.warn(`Client connected unauthenticated: ${client.id}`);
      }
    } else {
      this.logger.log(`Client connected unauthenticated: ${client.id}`);
    }

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
    this.connections.delete(client.id);
    this.rateLimits.delete(client.id);
    this.analyticsService.removeActiveSession(client.id);
    this.broadcastActiveUsers();
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  onModuleDestroy(): void {
    for (const heartbeat of this.heartbeats.values()) {
      clearInterval(heartbeat);
    }
    this.heartbeats.clear();
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

  getServer(): Server {
    return this.server;
  }
}
