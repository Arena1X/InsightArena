import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchPrediction } from '../matches/entities/match-prediction.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { User } from '../users/entities/user.entity';

export interface NotificationBatch {
  notifications: Array<{
    userAddress: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }>;
}

@Injectable()
export class NotificationGeneratorService {
  private readonly logger = new Logger(NotificationGeneratorService.name);
  private readonly notificationQueue: Array<NotificationBatch> = [];
  private isProcessing = false;
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(CreatorEvent)
    private readonly creatorEventRepository: Repository<CreatorEvent>,
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    @InjectRepository(MatchPrediction)
    private readonly matchPredictionRepository: Repository<MatchPrediction>,
    @InjectRepository(UserPreferences)
    private readonly userPreferencesRepository: Repository<UserPreferences>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.startQueueProcessor();
  }

  async handleEventCreated(data: Record<string, unknown>): Promise<void> {
    const eventId = Number(data.event_id);
    const creator = this.readString(data, 'creator');
    const title = this.readString(data, 'title');

    if (!eventId || !creator) {
      this.logger.warn('EventCreated notification skipped: missing data');
      return;
    }

    const shouldNotify = await this.shouldSendNotification(
      creator,
      NotificationType.EventCreated,
    );
    if (!shouldNotify) return;

    await this.queueNotification({
      userAddress: creator,
      type: NotificationType.EventCreated,
      title: 'Event Created Successfully',
      message: `Your event "${title || `Event #${eventId}`}" has been created successfully.`,
      data: { event_id: eventId, title },
    });
  }

  async handleMatchAdded(data: Record<string, unknown>): Promise<void> {
    const matchId = Number(data.match_id);
    const eventId = Number(data.event_id);
    const teamA = this.readString(data, 'team_a');
    const teamB = this.readString(data, 'team_b');

    if (!matchId || !eventId) {
      this.logger.warn('MatchAdded notification skipped: missing data');
      return;
    }

    const event = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: eventId },
    });
    if (!event) {
      this.logger.warn(
        `MatchAdded notification skipped: event ${eventId} not found`,
      );
      return;
    }

    // Notify all participants of the event
    const participants = await this.getEventParticipants(eventId);
    const notifications = participants
      .filter((addr) => addr !== event.creator_address)
      .map((address) => ({
        userAddress: address,
        type: NotificationType.MatchAdded,
        title: 'New Match Added',
        message: `A new match between ${teamA} and ${teamB} has been added to your event.`,
        data: {
          match_id: matchId,
          event_id: eventId,
          team_a: teamA,
          team_b: teamB,
        },
      }));

    await this.queueBatchNotifications(notifications);
  }

  async handleUserJoinedEvent(data: Record<string, unknown>): Promise<void> {
    const eventId = Number(data.event_id);
    const userAddress = this.readString(data, 'user_address');

    if (!eventId || !userAddress) {
      this.logger.warn('UserJoinedEvent notification skipped: missing data');
      return;
    }

    const event = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: eventId },
    });
    if (!event) {
      this.logger.warn(
        `UserJoinedEvent notification skipped: event ${eventId} not found`,
      );
      return;
    }

    const shouldNotify = await this.shouldSendNotification(
      event.creator_address,
      NotificationType.MatchAdded,
    );
    if (!shouldNotify) return;

    await this.queueNotification({
      userAddress: event.creator_address,
      type: NotificationType.MatchAdded,
      title: 'New Participant Joined',
      message: `A new participant has joined your event "${event.title}".`,
      data: { event_id: eventId, participant: userAddress },
    });
  }

  async handlePredictionSubmitted(
    data: Record<string, unknown>,
  ): Promise<void> {
    const matchId = Number(data.match_id);
    const predictor = this.readString(data, 'predictor');
    const predictedOutcome = this.readString(data, 'predicted_outcome');

    if (!matchId || !predictor) {
      this.logger.warn(
        'PredictionSubmitted notification skipped: missing data',
      );
      return;
    }

    const shouldNotify = await this.shouldSendNotification(
      predictor,
      NotificationType.PredictionSubmitted,
    );
    if (!shouldNotify) return;

    await this.queueNotification({
      userAddress: predictor,
      type: NotificationType.PredictionSubmitted,
      title: 'Prediction Submitted',
      message: `Your prediction for match #${matchId} has been submitted successfully.`,
      data: { match_id: matchId, predicted_outcome: predictedOutcome },
    });
  }

  async handleMatchResultSubmitted(
    data: Record<string, unknown>,
  ): Promise<void> {
    const matchId = Number(data.match_id);
    const eventId = Number(data.event_id);
    const winningTeam = Number(data.winning_team);

    if (!matchId) {
      this.logger.warn(
        'MatchResultSubmitted notification skipped: missing data',
      );
      return;
    }

    const match = await this.matchRepository.findOne({
      where: { on_chain_match_id: matchId },
      relations: ['event'],
    });
    if (!match) {
      this.logger.warn(
        `MatchResultSubmitted notification skipped: match ${matchId} not found`,
      );
      return;
    }

    // Get all predictors for this match
    const predictions = await this.matchPredictionRepository.find({
      where: { match: { id: match.id } },
      relations: ['user'],
    });

    const notifications = predictions.map((prediction) => ({
      userAddress: prediction.user.stellar_address,
      type: NotificationType.MatchResolved,
      title: 'Match Result Submitted',
      message: `The result for match between ${match.team_a} and ${match.team_b} has been submitted.`,
      data: {
        match_id: matchId,
        event_id: eventId || match.event.on_chain_event_id,
        winning_team: winningTeam,
      },
    }));

    await this.queueBatchNotifications(notifications);
  }

  async handleWinnersVerified(data: Record<string, unknown>): Promise<void> {
    const eventId = Number(data.event_id);

    if (!eventId) {
      this.logger.warn(
        'WinnersVerified notification skipped: missing event_id',
      );
      return;
    }

    const event = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: eventId },
    });
    if (!event) {
      this.logger.warn(
        `WinnersVerified notification skipped: event ${eventId} not found`,
      );
      return;
    }

    // Get all predictions for this event to find winners
    const matches = await this.matchRepository.find({
      where: { event: { id: event.id } },
      relations: ['predictions', 'predictions.user'],
    });

    const winnerAddresses = new Set<string>();
    for (const match of matches) {
      for (const prediction of match.predictions) {
        if (prediction.is_correct) {
          winnerAddresses.add(prediction.user.stellar_address);
        }
      }
    }

    const notifications = Array.from(winnerAddresses).map((address) => ({
      userAddress: address,
      type: NotificationType.WinnerVerified,
      title: 'Congratulations! You Won!',
      message: `You have been verified as a winner for event "${event.title}".`,
      data: { event_id: eventId, event_title: event.title },
    }));

    await this.queueBatchNotifications(notifications);
  }

  async handleEventCancelled(data: Record<string, unknown>): Promise<void> {
    const eventId = Number(data.event_id);

    if (!eventId) {
      this.logger.warn('EventCancelled notification skipped: missing event_id');
      return;
    }

    const event = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: eventId },
    });
    if (!event) {
      this.logger.warn(
        `EventCancelled notification skipped: event ${eventId} not found`,
      );
      return;
    }

    // Notify all participants
    const participants = await this.getEventParticipants(eventId);
    const notifications = participants.map((address) => ({
      userAddress: address,
      type: NotificationType.EventCancelled,
      title: 'Event Cancelled',
      message: `The event "${event.title}" has been cancelled.`,
      data: { event_id: eventId, event_title: event.title },
    }));

    await this.queueBatchNotifications(notifications);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async queueNotification(notification: {
    userAddress: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    this.notificationQueue.push({ notifications: [notification] });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async queueBatchNotifications(
    notifications: Array<{
      userAddress: string;
      type: NotificationType;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    // Split into batches
    for (let i = 0; i < notifications.length; i += this.BATCH_SIZE) {
      const batch = notifications.slice(i, i + this.BATCH_SIZE);
      this.notificationQueue.push({ notifications: batch });
    }
  }

  private startQueueProcessor(): void {
    setInterval(() => {
      void this.processQueue();
    }, this.FLUSH_INTERVAL);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.notificationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batch = this.notificationQueue.shift();
      if (!batch) return;

      await this.createNotificationsBatch(batch.notifications);
    } catch (error) {
      this.logger.error('Error processing notification queue', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async createNotificationsBatch(
    notifications: Array<{
      userAddress: string;
      type: NotificationType;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    if (notifications.length === 0) return;

    const entities = notifications.map((n) =>
      this.notificationsRepository.create({
        user_address: n.userAddress,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data ?? null,
      }),
    );

    await this.notificationsRepository.save(entities);
    this.logger.log(`Batch created ${notifications.length} notifications`);
  }

  private async shouldSendNotification(
    userAddress: string,
    notificationType: NotificationType,
  ): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({
        where: { stellar_address: userAddress },
        relations: ['preferences'],
      });

      if (!user || !user.preferences) {
        return true; // Default to sending if no preferences found
      }

      const prefs = user.preferences;

      // Check specific notification type preferences
      switch (notificationType) {
        case NotificationType.EventCreated:
          return prefs.event_created_notifications !== false;
        case NotificationType.MatchAdded:
          return prefs.match_added_notifications !== false;
        case NotificationType.PredictionSubmitted:
          return prefs.prediction_submitted_notifications !== false;
        case NotificationType.MatchResolved:
          return prefs.match_resolved_notifications !== false;
        case NotificationType.WinnerVerified:
          return prefs.winner_verified_notifications !== false;
        case NotificationType.EventCancelled:
          return prefs.event_cancelled_notifications !== false;
        default:
          return true;
      }
    } catch (error) {
      this.logger.error(
        `Error checking notification preferences for ${userAddress}`,
        error,
      );
      return true; // Default to sending on error
    }
  }

  private async getEventParticipants(eventId: number): Promise<string[]> {
    const event = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: eventId },
      relations: ['matches', 'matches.predictions', 'matches.predictions.user'],
    });

    if (!event) return [];

    const participants = new Set<string>();
    participants.add(event.creator_address);

    for (const match of event.matches) {
      for (const prediction of match.predictions) {
        participants.add(prediction.user.stellar_address);
      }
    }

    return Array.from(participants);
  }

  private readString(data: Record<string, unknown>, key: string): string {
    const val = data[key];
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    return '';
  }

  async flushQueue(): Promise<void> {
    while (this.notificationQueue.length > 0) {
      await this.processQueue();
    }
  }
}
