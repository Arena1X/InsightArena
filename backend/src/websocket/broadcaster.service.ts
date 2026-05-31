import { Injectable, Logger } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

@Injectable()
export class BroadcasterService {
  private readonly logger = new Logger(BroadcasterService.name);

  constructor(private readonly gateway: EventsGateway) {}

  broadcastEventCreated(data: Record<string, unknown>): void {
    const payload = {
      event: 'event:created',
      data: {
        event_id: data.event_id,
        creator: data.creator,
        title: data.title,
        invite_code: data.invite_code,
        max_participants: data.max_participants,
        created_at: data.created_at,
      },
    };
    this.gateway.server.emit('event:created', payload);
    this.logger.log(
      `Broadcast event:created → all (event_id=${String(data.event_id)})`,
    );
  }

  broadcastEventUpdated(
    eventId: string | number,
    data: Record<string, unknown>,
  ): void {
    const id = String(eventId);
    const payload = { event: 'event:updated', data: { event_id: id, ...data } };
    this.gateway.server.to(`event:${id}`).emit('event:updated', payload);
    this.logger.log(`Broadcast event:updated → event:${id}`);
  }

  broadcastMatchAdded(data: Record<string, unknown>): void {
    const eventId = String(data.event_id);
    const payload = {
      event: 'match:added',
      data: {
        match_id: data.match_id,
        event_id: eventId,
        team_a: data.team_a,
        team_b: data.team_b,
        match_time: data.match_time,
      },
    };
    this.gateway.server.to(`event:${eventId}`).emit('match:added', payload);
    this.logger.log(`Broadcast match:added → event:${eventId}`);
  }

  broadcastUserJoined(data: Record<string, unknown>): void {
    const eventId = String(data.event_id);
    const payload = {
      event: 'user:joined',
      data: { event_id: eventId, user_address: data.user_address },
    };
    this.gateway.server.to(`event:${eventId}`).emit('user:joined', payload);
    this.logger.log(`Broadcast user:joined → event:${eventId}`);
  }

  broadcastPredictionSubmitted(data: Record<string, unknown>): void {
    const matchId = String(data.match_id);
    const eventId = String(data.event_id);
    const payload = {
      event: 'prediction:submitted',
      data: {
        match_id: matchId,
        event_id: eventId,
        predictor: data.predictor,
        predicted_outcome: data.predicted_outcome,
      },
    };
    const rooms: string[] = [];
    if (data.event_id) rooms.push(`event:${eventId}`);
    if (data.match_id) rooms.push(`match:${matchId}`);
    for (const room of rooms) {
      this.gateway.server.to(room).emit('prediction:submitted', payload);
    }
    this.logger.log(`Broadcast prediction:submitted → ${rooms.join(', ')}`);
  }

  broadcastMatchResolved(data: Record<string, unknown>): void {
    const matchId = String(data.match_id);
    const eventId = String(data.event_id);
    const payload = {
      event: 'match:resolved',
      data: {
        match_id: matchId,
        event_id: eventId,
        winning_team: data.winning_team,
        submitted_by: data.submitted_by,
      },
    };
    const rooms: string[] = [];
    if (data.event_id) rooms.push(`event:${eventId}`);
    if (data.match_id) rooms.push(`match:${matchId}`);
    for (const room of rooms) {
      this.gateway.server.to(room).emit('match:resolved', payload);
    }
    this.logger.log(`Broadcast match:resolved → ${rooms.join(', ')}`);
  }

  broadcastWinnersVerified(data: Record<string, unknown>): void {
    const eventId = String(data.event_id);
    const payload = {
      event: 'winners:verified',
      data: { event_id: eventId, winners: data.winners },
    };
    this.gateway.server
      .to(`event:${eventId}`)
      .emit('winners:verified', payload);
    this.logger.log(`Broadcast winners:verified → event:${eventId}`);
  }

  broadcastEventCancelled(data: Record<string, unknown>): void {
    const eventId = String(data.event_id);
    const payload = {
      event: 'event:cancelled',
      data: { event_id: eventId, title: data.title },
    };
    this.gateway.server.to(`event:${eventId}`).emit('event:cancelled', payload);
    this.logger.log(`Broadcast event:cancelled → event:${eventId}`);
  }
}
