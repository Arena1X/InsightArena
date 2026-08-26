import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import {
  NotificationCategoryPreference,
  NotificationCategory,
} from './entities/notification-category-preference.entity';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchPrediction } from '../matches/entities/match-prediction.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

export interface NotificationBatch {
  notifications: Array<{
    userAddress: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }>;
}

export interface DisputeSlaNotificationInput {
  disputeId: string;
  marketId: string;
  marketTitle: string;
  slaDeadline: Date;
  recipientAddresses: string[];
}

export interface OracleDivergenceNotificationInput {
  matchId: string;
  sourceAName: string;
  sourceBName: string;
}

@Injectable()
export class NotificationGeneratorService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationGeneratorService.name);
  private readonly notificationQueue: Array<NotificationBatch> = [];
  private isProcessing = false;
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds
  private queueProcessorInterval?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(NotificationCategoryPreference)
    private readonly categoryPreferencesRepository: Repository<NotificationCategoryPreference>,
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

  onModuleDestroy(): void {
    if (this.queueProcessorInterval) {
      clearInterval(this.queueProcessorInterval);
      this.queueProcessorInterval = undefined;
    }
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

  /**
   * Advisory reminder that a pending dispute's current SLA stage is close
   * to its deadline. Sent to the assigned arbiter (if any) and admins.
   */
  async notifyDisputeSlaApproaching(
    input: DisputeSlaNotificationInput,
  ): Promise<void> {
    if (input.recipientAddresses.length === 0) return;

    const notifications = input.recipientAddresses.map((address) => ({
      userAddress: address,
      type: NotificationType.DisputeSlaApproaching,
      title: 'Dispute SLA Approaching',
      message: `Dispute for market "${input.marketTitle}" must be reviewed before ${input.slaDeadline.toISOString()}.`,
      data: {
        dispute_id: input.disputeId,
        market_id: input.marketId,
        sla_deadline: input.slaDeadline.toISOString(),
      },
    }));

    await this.queueBatchNotifications(notifications);
  }

  /**
   * Sent when a pending dispute's SLA deadline has passed. `escalated`
   * indicates the dispute was moved into the next SLA stage as a result.
   */
  async notifyDisputeSlaBreached(
    input: DisputeSlaNotificationInput & { escalated: boolean },
  ): Promise<void> {
    if (input.recipientAddresses.length === 0) return;

    const title = input.escalated
      ? 'Dispute SLA Breached — Escalated'
      : 'Dispute SLA Breached';
    const message = `Dispute for market "${input.marketTitle}" missed its SLA deadline (${input.slaDeadline.toISOString()})${
      input.escalated ? ' and has been escalated' : ''
    }.`;

    const notifications = input.recipientAddresses.map((address) => ({
      userAddress: address,
      type: NotificationType.DisputeSlaBreached,
      title,
      message,
      data: {
        dispute_id: input.disputeId,
        market_id: input.marketId,
        sla_deadline: input.slaDeadline.toISOString(),
        escalated: input.escalated,
      },
    }));

    await this.queueBatchNotifications(notifications);
  }

  /**
   * Alerts admins that two result sources disagree for a match, which has
   * been quarantined (marked DISPUTED_SOURCE) pending manual review.
   */
  async notifyOracleDivergence(
    input: OracleDivergenceNotificationInput,
  ): Promise<void> {
    const admins = await this.userRepository.find({
      where: { role: Role.Admin },
    });
    const addresses = admins
      .map((admin) => admin.stellar_address)
      .filter((address): address is string => Boolean(address));

    if (addresses.length === 0) return;

    const notifications = addresses.map((address) => ({
      userAddress: address,
      type: NotificationType.OracleResultDivergence,
      title: 'Oracle Result Divergence Detected',
      message: `Match ${input.matchId} has conflicting results from ${input.sourceAName} and ${input.sourceBName}. The match is quarantined pending manual review.`,
      data: {
        match_id: input.matchId,
        source_a: input.sourceAName,
        source_b: input.sourceBName,
      },
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
    this.queueProcessorInterval = setInterval(() => {
      void this.processQueue();
    }, this.FLUSH_INTERVAL);
    this.queueProcessorInterval.unref?.();
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
      // Check legacy per-type preferences (UserPreferences)
      const user = await this.userRepository.findOne({
        where: { stellar_address: userAddress },
        relations: ['preferences'],
      });

      if (user?.preferences) {
        const prefs = user.preferences;
        switch (notificationType) {
          case NotificationType.EventCreated:
            if (prefs.event_created_notifications === false) return false;
            break;
          case NotificationType.MatchAdded:
            if (prefs.match_added_notifications === false) return false;
            break;
          case NotificationType.PredictionSubmitted:
            if (prefs.prediction_submitted_notifications === false)
              return false;
            break;
          case NotificationType.MatchResolved:
            if (prefs.match_resolved_notifications === false) return false;
            break;
          case NotificationType.WinnerVerified:
            if (prefs.winner_verified_notifications === false) return false;
            break;
          case NotificationType.EventCancelled:
            if (prefs.event_cancelled_notifications === false) return false;
            break;
        }
      }

      // Check per-category preference for in_app channel
      if (user?.id) {
        const category = this.mapTypeToCategory(notificationType);
        if (category) {
          const catPref = await this.categoryPreferencesRepository.findOne({
            where: { userId: user.id, category },
          });
          if (catPref && !catPref.in_app) return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Error checking notification preferences for ${userAddress}`,
        error,
      );
      return true;
    }
  }

  private mapTypeToCategory(
    type: NotificationType,
  ): NotificationCategory | null {
    const map: Record<string, NotificationCategory> = {
      [NotificationType.EventCreated]: NotificationCategory.EventCreated,
      [NotificationType.MatchAdded]: NotificationCategory.MatchAdded,
      [NotificationType.PredictionSubmitted]:
        NotificationCategory.PredictionSubmitted,
      [NotificationType.MatchResolved]: NotificationCategory.MatchResolved,
      [NotificationType.WinnerVerified]: NotificationCategory.WinnerVerified,
      [NotificationType.EventCancelled]: NotificationCategory.EventCancelled,
    };
    return map[type] ?? null;
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
