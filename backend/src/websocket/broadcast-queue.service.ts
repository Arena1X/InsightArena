import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Optional } from '@nestjs/common';
import type { Server } from 'socket.io';

interface QueuedMessage {
  /** Coalesce key: a later message with the same key replaces the earlier one in-queue. */
  key: string;
  event: string;
  payload: unknown;
}

interface SocketQueue {
  messages: QueuedMessage[];
  flushTimer: NodeJS.Timeout;
}

export interface BroadcastQueueMetrics {
  /** Messages dropped because a socket's queue was at capacity and the message wasn't coalescable. */
  dropped: number;
  /** Messages that replaced an already-queued message sharing the same coalesce key. */
  coalesced: number;
  /** Messages successfully flushed to a socket. */
  sent: number;
}

/**
 * Per-connection bounded outbound queue for high-frequency broadcasts
 * (e.g. live odds updates).
 *
 * Problem: emitting directly to a room (`server.to(room).emit(...)`) hands
 * the payload to every socket's write buffer synchronously in a single
 * server tick. A slow/backgrounded client whose transport can't drain fast
 * enough causes its write buffer to grow — and because all sockets in the
 * room are iterated in the same call, a pathological client can add
 * latency to that broadcast for everyone else sharing the tick.
 *
 * Fix: queue per-socket instead of emitting directly. Each socket gets a
 * small bounded buffer (`maxQueueSize` messages). Messages carry a
 * coalesce key (e.g. `market:<id>`); a new message for a key already
 * queued replaces it in place — only the latest odds snapshot matters, so
 * this is safe and keeps memory bounded even under sustained updates.
 * When the queue is full and the incoming message can't coalesce with
 * anything already queued, the oldest message is dropped to make room.
 * A per-socket flush timer drains the queue on a short interval, so one
 * slow socket's flush never blocks another's.
 */
@Injectable()
export class BroadcastQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(BroadcastQueueService.name);
  private readonly queues = new Map<string, SocketQueue>();

  private readonly maxQueueSize: number;
  private readonly flushIntervalMs: number;

  private readonly metrics: BroadcastQueueMetrics = {
    dropped: 0,
    coalesced: 0,
    sent: 0,
  };

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.maxQueueSize =
      this.configService?.get<number>('BROADCAST_QUEUE_MAX_SIZE') ?? 20;
    this.flushIntervalMs =
      this.configService?.get<number>('BROADCAST_QUEUE_FLUSH_MS') ?? 100;
  }

  /**
   * Enqueue a message for delivery to a single socket. Messages sharing
   * `key` for the same socket coalesce (latest wins). Call this instead of
   * `socket.emit(...)` directly for high-frequency broadcast payloads.
   */
  enqueue(
    server: Server,
    socketId: string,
    key: string,
    event: string,
    payload: unknown,
  ): void {
    let queue = this.queues.get(socketId);
    if (!queue) {
      queue = {
        messages: [],
        flushTimer: this.startFlushTimer(server, socketId),
      };
      this.queues.set(socketId, queue);
    }

    const existingIndex = queue.messages.findIndex((m) => m.key === key);
    if (existingIndex !== -1) {
      queue.messages[existingIndex] = { key, event, payload };
      this.metrics.coalesced++;
      return;
    }

    if (queue.messages.length >= this.maxQueueSize) {
      queue.messages.shift();
      this.metrics.dropped++;
      this.logger.warn(
        `[backpressure] dropped oldest queued message for socket ${socketId} (queue at capacity: ${this.maxQueueSize})`,
      );
    }

    queue.messages.push({ key, event, payload });
  }

  /** Removes a socket's queue and stops its flush timer (call on disconnect). */
  removeSocket(socketId: string): void {
    const queue = this.queues.get(socketId);
    if (!queue) return;
    clearInterval(queue.flushTimer);
    this.queues.delete(socketId);
  }

  /** Snapshot of dropped/coalesced/sent counters, for metrics/health reporting. */
  getMetrics(): BroadcastQueueMetrics {
    return { ...this.metrics };
  }

  /** Number of messages currently queued for a socket (test/inspection helper). */
  getQueueDepth(socketId: string): number {
    return this.queues.get(socketId)?.messages.length ?? 0;
  }

  private startFlushTimer(server: Server, socketId: string): NodeJS.Timeout {
    const timer = setInterval(() => {
      this.flush(server, socketId);
    }, this.flushIntervalMs);
    timer.unref?.();
    return timer;
  }

  private flush(server: Server, socketId: string): void {
    const queue = this.queues.get(socketId);
    if (!queue || queue.messages.length === 0) return;

    const socket = server.sockets.sockets.get(socketId);
    if (!socket) {
      // Socket already disconnected; stop queueing for it.
      this.removeSocket(socketId);
      return;
    }

    const pending = queue.messages;
    queue.messages = [];

    for (const message of pending) {
      try {
        socket.emit(message.event, message.payload);
        this.metrics.sent++;
      } catch (error) {
        this.logger.warn(
          `[backpressure] failed to emit to socket ${socketId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  onModuleDestroy(): void {
    for (const queue of this.queues.values()) {
      clearInterval(queue.flushTimer);
    }
    this.queues.clear();
  }
}
