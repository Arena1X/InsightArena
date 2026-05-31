import { Logger } from '@nestjs/common';
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
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private readonly connections = new Map<string, string>(); // socketId → userAddress
  private readonly rateLimits = new Map<string, number>(); // socketId → message count
  private readonly RATE_LIMIT = 60; // messages per minute
  private readonly RATE_WINDOW = 60_000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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
    const heartbeat = setInterval(() => {
      client.emit('ping');
    }, 25_000);

    client.on('pong', () => {
      this.logger.debug(`Pong from ${client.id}`);
    });

    client.on('disconnect', () => clearInterval(heartbeat));
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.connections.delete(client.id);
    this.rateLimits.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() room: string,
  ): Promise<void> {
    if (!this.checkRateLimit(client.id)) {
      client.emit('error', { message: 'Rate limit exceeded' });
      return;
    }

    // Validate room format
    if (
      !room ||
      !/^(event|match):\d+$/.test(room) &&
      !/^user:[A-Z0-9]{56}$/.test(room)
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
  }

  @SubscribeMessage('leave')
  async handleLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() room: string,
  ): Promise<void> {
    await client.leave(room);
    client.emit('left', { room });
  }

  private checkRateLimit(socketId: string): boolean {
    const count = this.rateLimits.get(socketId) ?? 0;
    if (count >= this.RATE_LIMIT) return false;
    this.rateLimits.set(socketId, count + 1);
    if (count === 0) {
      setTimeout(() => this.rateLimits.delete(socketId), this.RATE_WINDOW);
    }
    return true;
  }

  getServer(): Server {
    return this.server;
  }
}
