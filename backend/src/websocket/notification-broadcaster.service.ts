import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

export interface NotificationPayload {
  id: number;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  created_at: Date;
}

export interface PredictionResultPayload {
  match_id: number;
  event_id: number;
  winning_team: string;
  user_prediction: string;
  is_correct: boolean;
}

export interface EventWinnerPayload {
  event_id: number;
  event_title: string;
  rank: number;
  total_winners: number;
  correct_predictions: number;
  total_matches: number;
}

export interface AchievementUnlockedPayload {
  achievement_id: string;
  type: string;
  title: string;
  description: string;
  icon_url: string;
  reward_points: number;
  unlocked_at: Date;
}

export interface AchievementProgressPayload {
  achievement_id: string;
  type: string;
  current_progress: number;
  threshold: number;
  progress_percentage: number;
}

@Injectable()
export class NotificationBroadcasterService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationBroadcasterService.name);
  private readonly batchQueue = new Map<string, NotificationPayload[]>();
  private readonly batchInterval = 1000; // 1 second
  private readonly maxBatchSize = 10;
  private deliveryConfirmations = new Map<string, Set<number>>();
  private batchProcessorInterval?: NodeJS.Timeout;

  constructor(private readonly gateway: EventsGateway) {
    this.startBatchProcessor();
  }

  onModuleDestroy(): void {
    if (this.batchProcessorInterval) {
      clearInterval(this.batchProcessorInterval);
    }
  }

  /**
   * Send a new notification to a specific user
   */
  broadcastNewNotification(
    userAddress: string,
    notification: NotificationPayload,
  ): void {
    this.queueNotification(userAddress, 'notification:new', notification);
  }

  /**
   * Notify user that a notification was marked as read
   */
  broadcastNotificationRead(userAddress: string, notificationId: number): void {
    const payload = {
      event: 'notification:read',
      data: { notification_id: notificationId, read_at: new Date() },
    };
    this.gateway.server
      .to(`user:${userAddress}`)
      .emit('notification:read', payload);
    this.logger.log(
      `Broadcast notification:read → user:${userAddress} (id=${notificationId})`,
    );
  }

  /**
   * Notify user about a prediction result
   */
  broadcastPredictionResult(
    userAddress: string,
    result: PredictionResultPayload,
  ): void {
    const payload = {
      event: 'prediction:result',
      data: {
        match_id: result.match_id,
        event_id: result.event_id,
        winning_team: result.winning_team,
        user_prediction: result.user_prediction,
        is_correct: result.is_correct,
        timestamp: new Date(),
      },
    };
    this.gateway.server
      .to(`user:${userAddress}`)
      .emit('prediction:result', payload);
    this.logger.log(
      `Broadcast prediction:result → user:${userAddress} (match=${result.match_id}, correct=${result.is_correct})`,
    );
  }

  /**
   * Notify user they won an event
   */
  broadcastEventWinner(userAddress: string, winner: EventWinnerPayload): void {
    const payload = {
      event: 'event:winner',
      data: {
        event_id: winner.event_id,
        event_title: winner.event_title,
        rank: winner.rank,
        total_winners: winner.total_winners,
        correct_predictions: winner.correct_predictions,
        total_matches: winner.total_matches,
        timestamp: new Date(),
      },
    };
    this.gateway.server.to(`user:${userAddress}`).emit('event:winner', payload);
    this.logger.log(
      `Broadcast event:winner → user:${userAddress} (event=${winner.event_id}, rank=${winner.rank})`,
    );
  }

  /**
   * Notify user that an achievement was unlocked
   */
  broadcastAchievementUnlocked(
    userAddress: string,
    achievement: AchievementUnlockedPayload,
  ): void {
    const payload = {
      event: 'achievement:unlocked',
      data: {
        achievement_id: achievement.achievement_id,
        type: achievement.type,
        title: achievement.title,
        description: achievement.description,
        icon_url: achievement.icon_url,
        reward_points: achievement.reward_points,
        unlocked_at: achievement.unlocked_at,
        timestamp: new Date(),
      },
    };
    this.gateway.server
      .to(`user:${userAddress}`)
      .emit('achievement:unlocked', payload);
    this.logger.log(
      `Broadcast achievement:unlocked → user:${userAddress} (achievement=${achievement.achievement_id})`,
    );
  }

  /**
   * Notify user of updated progress toward a locked achievement
   */
  broadcastAchievementProgress(
    userAddress: string,
    progress: AchievementProgressPayload,
  ): void {
    const payload = {
      event: 'achievement:progress',
      data: {
        achievement_id: progress.achievement_id,
        type: progress.type,
        current_progress: progress.current_progress,
        threshold: progress.threshold,
        progress_percentage: progress.progress_percentage,
        timestamp: new Date(),
      },
    };
    this.gateway.server
      .to(`user:${userAddress}`)
      .emit('achievement:progress', payload);
    this.logger.log(
      `Broadcast achievement:progress → user:${userAddress} (achievement=${progress.achievement_id}, pct=${progress.progress_percentage})`,
    );
  }

  /**
   * Request delivery confirmation from client
   */
  requestDeliveryConfirmation(
    userAddress: string,
    notificationId: number,
  ): void {
    this.gateway.server
      .to(`user:${userAddress}`)
      .emit('notification:confirm', { notification_id: notificationId });
  }

  /**
   * Record delivery confirmation
   */
  confirmDelivery(userAddress: string, notificationId: number): void {
    if (!this.deliveryConfirmations.has(userAddress)) {
      this.deliveryConfirmations.set(userAddress, new Set());
    }
    this.deliveryConfirmations.get(userAddress)!.add(notificationId);
    this.logger.debug(
      `Delivery confirmed: user=${userAddress}, notification=${notificationId}`,
    );
  }

  /**
   * Check if notification was delivered
   */
  isDelivered(userAddress: string, notificationId: number): boolean {
    return (
      this.deliveryConfirmations.get(userAddress)?.has(notificationId) ?? false
    );
  }

  /**
   * Queue notification for batching
   */
  private queueNotification(
    userAddress: string,
    eventType: string,
    notification: NotificationPayload,
  ): void {
    const key = `${userAddress}:${eventType}`;
    if (!this.batchQueue.has(key)) {
      this.batchQueue.set(key, []);
    }
    const queue = this.batchQueue.get(key)!;
    queue.push(notification);

    // Send immediately if batch is full
    if (queue.length >= this.maxBatchSize) {
      this.flushBatch(userAddress, eventType);
    }
  }

  /**
   * Flush batched notifications
   */
  private flushBatch(userAddress: string, eventType: string): void {
    const key = `${userAddress}:${eventType}`;
    const queue = this.batchQueue.get(key);
    if (!queue || queue.length === 0) return;

    const payload = {
      event: eventType,
      data: {
        notifications: queue,
        count: queue.length,
        timestamp: new Date(),
      },
    };

    this.gateway.server.to(`user:${userAddress}`).emit(eventType, payload);
    this.logger.log(
      `Broadcast ${eventType} → user:${userAddress} (batch=${queue.length})`,
    );

    // Request confirmation for each notification
    queue.forEach((n) => this.requestDeliveryConfirmation(userAddress, n.id));

    this.batchQueue.delete(key);
  }

  /**
   * Process batches periodically
   */
  private startBatchProcessor(): void {
    this.batchProcessorInterval = setInterval(() => {
      for (const key of this.batchQueue.keys()) {
        const colonIndex = key.indexOf(':');
        const userAddress = key.substring(0, colonIndex);
        const eventType = key.substring(colonIndex + 1);
        this.flushBatch(userAddress, eventType);
      }
    }, this.batchInterval);
  }

  /**
   * Clean up old confirmations (call periodically)
   */
  cleanupConfirmations(): void {
    // Simple cleanup - in production, track timestamps
    if (this.deliveryConfirmations.size > 10000) {
      this.deliveryConfirmations.clear();
      this.logger.log('Cleared delivery confirmations cache');
    }
  }
}
