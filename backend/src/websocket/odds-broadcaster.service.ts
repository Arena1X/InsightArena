import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { BroadcastQueueService } from './broadcast-queue.service';
import { PredictionStatsDto } from '../markets/dto/prediction-stats.dto';

export interface OddsUpdatePayload {
  market_id: string;
  odds: PredictionStatsDto[];
  timestamp: string;
}

/**
 * OddsBroadcasterService
 *
 * Manages per-market subscriber counts, per-market throttle timers, and
 * broadcasting of live-odds updates to `market:{uuid}` rooms.
 *
 * Design:
 * - subscriberCount tracks how many sockets are in each market room so that
 *   empty rooms are cleaned up when the last subscriber leaves.
 * - pendingBroadcast holds the most-recent odds payload queued for a market
 *   that is already inside its throttle window.
 * - throttleTimer holds the active NodeJS.Timeout for the trailing broadcast,
 *   keyed by market_id.
 *
 * Throttle behaviour (leading + trailing):
 * 1. If no timer is running for the market, emit immediately and start a timer.
 * 2. If a timer is already running, replace the pending payload so that the
 *    most-recent data is sent when the timer fires.
 * This ensures clients receive odds within THROTTLE_MS of the last change,
 * rather than only on the very first update or on a fixed schedule.
 */
@Injectable()
export class OddsBroadcasterService implements OnModuleDestroy {
  private readonly logger = new Logger(OddsBroadcasterService.name);

  /** Number of active socket subscribers per market room. */
  private readonly subscriberCount = new Map<string, number>();

  /** Latest pending odds payload waiting for the throttle window to close. */
  private readonly pendingBroadcast = new Map<string, OddsUpdatePayload>();

  /** Active trailing-edge throttle timers keyed by market_id. */
  private readonly throttleTimer = new Map<string, NodeJS.Timeout>();

  private readonly throttleMs: number;

  constructor(
    private readonly gateway: EventsGateway,
    private readonly broadcastQueue: BroadcastQueueService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.throttleMs =
      this.configService?.get<number>('ODDS_THROTTLE_MS') ?? 500;
  }

  // ---------------------------------------------------------------------------
  // Public API used by EventsGateway
  // ---------------------------------------------------------------------------

  /**
   * Record a new subscriber for market `marketId`.
   * Called by EventsGateway when a client sends `subscribe:market`.
   */
  onSubscribe(marketId: string): void {
    const current = this.subscriberCount.get(marketId) ?? 0;
    this.subscriberCount.set(marketId, current + 1);
    this.logger.debug(
      `[odds] subscribe market:${marketId} — subscribers: ${current + 1}`,
    );
  }

  /**
   * Record a subscriber leaving market `marketId`.
   * Called by EventsGateway when a client sends `unsubscribe:market` or
   * disconnects while subscribed.
   * Cleans up the room state when the last subscriber leaves.
   */
  onUnsubscribe(marketId: string): void {
    const current = this.subscriberCount.get(marketId) ?? 0;
    const next = Math.max(0, current - 1);

    if (next === 0) {
      this.cleanupMarket(marketId);
    } else {
      this.subscriberCount.set(marketId, next);
    }

    this.logger.debug(
      `[odds] unsubscribe market:${marketId} — subscribers: ${next}`,
    );
  }

  /**
   * Return the number of active subscribers for a market room.
   * Primarily used in tests and health checks.
   */
  getSubscriberCount(marketId: string): number {
    return this.subscriberCount.get(marketId) ?? 0;
  }

  /**
   * Return true when at least one subscriber is listening to the market room.
   */
  hasSubscribers(marketId: string): boolean {
    return (this.subscriberCount.get(marketId) ?? 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // Broadcast logic (called by MarketsService)
  // ---------------------------------------------------------------------------

  /**
   * Broadcast a live-odds update to subscribers of `market:{marketId}`.
   *
   * Uses a leading+trailing throttle:
   * - If no timer is active: emit immediately, then start the throttle window.
   * - If a timer is already active: store the payload so it is sent when the
   *   window closes (most-recent data wins).
   *
   * No-ops when there are no subscribers, avoiding unnecessary allocations.
   */
  broadcastOddsUpdate(marketId: string, odds: PredictionStatsDto[]): void {
    // Skip entirely when nobody is listening.
    if (!this.hasSubscribers(marketId)) {
      return;
    }

    const payload: OddsUpdatePayload = {
      market_id: marketId,
      odds,
      timestamp: new Date().toISOString(),
    };

    if (!this.throttleTimer.has(marketId)) {
      // Leading edge: emit now and open the throttle window.
      this.emit(marketId, payload);

      const timer = setTimeout(() => {
        this.throttleTimer.delete(marketId);

        // Trailing edge: if an update arrived during the window, send it now.
        const pending = this.pendingBroadcast.get(marketId);
        if (pending) {
          this.pendingBroadcast.delete(marketId);
          this.emit(marketId, pending);
        }
      }, this.throttleMs);

      // Prevent the timer from keeping the Node.js event loop alive during tests.
      timer.unref?.();
      this.throttleTimer.set(marketId, timer);
    } else {
      // Inside the throttle window — queue the latest payload.
      this.pendingBroadcast.set(marketId, payload);
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /** Remove all state for a market (called when the last subscriber leaves). */
  private cleanupMarket(marketId: string): void {
    this.subscriberCount.delete(marketId);
    this.pendingBroadcast.delete(marketId);

    const timer = this.throttleTimer.get(marketId);
    if (timer) {
      clearTimeout(timer);
      this.throttleTimer.delete(marketId);
    }

    this.logger.debug(`[odds] cleaned up market:${marketId}`);
  }

  /** Flush all state on module shutdown. */
  onModuleDestroy(): void {
    for (const timer of this.throttleTimer.values()) {
      clearTimeout(timer);
    }
    this.throttleTimer.clear();
    this.pendingBroadcast.clear();
    this.subscriberCount.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Enqueues the update on each subscribed socket's own bounded outbound
   * queue instead of a direct room-wide `emit`, so one slow client can't
   * add latency to delivery for the rest of the room (see
   * BroadcastQueueService for the backpressure policy).
   */
  private emit(marketId: string, payload: OddsUpdatePayload): void {
    const room = `market:${marketId}`;
    const socketIds = this.gateway.server.sockets.adapter.rooms.get(room);

    if (socketIds) {
      for (const socketId of socketIds) {
        this.broadcastQueue.enqueue(
          this.gateway.server,
          socketId,
          `odds:${marketId}`,
          'odds:update',
          payload,
        );
      }
    }

    this.logger.debug(
      `[odds] queued odds:update → market:${marketId} (${payload.odds.length} outcomes, ${socketIds?.size ?? 0} subscriber(s))`,
    );
  }
}
