import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import {
  NotificationPreference,
  NotificationChannel,
  NotificationFrequency,
} from './entities/notification-preference.entity';
import { NotificationBroadcasterService } from '../websocket/notification-broadcaster.service';

// ---------------------------------------------------------------------------
// Pending-bucket type (in-memory, per HOURLY/DAILY users)
// ---------------------------------------------------------------------------

interface PendingEntry {
  userAddress: string;
  notification: Notification;
  enqueuedAt: Date;
}

// ---------------------------------------------------------------------------
// Quiet-hours helper
// ---------------------------------------------------------------------------

/**
 * Returns true when the current UTC time falls inside the quiet window
 * expressed as "HH:MM-HH:MM".
 *
 * Handles overnight windows (e.g. "22:00-07:00").
 */
export function isInQuietHours(quietHours: string, now = new Date()): boolean {
  const [startStr, endStr] = quietHours.split('-');
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (startMinutes <= endMinutes) {
    // Same-day window, e.g. "10:00-18:00"
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  } else {
    // Overnight window, e.g. "22:00-07:00"
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class NotificationsService {
  /**
   * In-memory pending buckets for HOURLY and DAILY users.
   * Key: `${frequency}:${userAddress}`, Value: ordered list of saved notifications.
   *
   * The DigestService (or a scheduler) calls `drainPending` to consume these.
   */
  private readonly pendingBuckets = new Map<string, PendingEntry[]>();

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferencesRepository: Repository<NotificationPreference>,
    private readonly notificationBroadcaster: NotificationBroadcasterService,
  ) {}

  // -------------------------------------------------------------------------
  // Preference helpers
  // -------------------------------------------------------------------------

  /** Returns the stored preference for the user+channel, or a safe default. */
  async getPreference(
    userId: string,
    channel: NotificationChannel = NotificationChannel.IN_APP,
  ): Promise<NotificationPreference> {
    const pref = await this.preferencesRepository.findOne({
      where: { userId, channel },
    });
    if (pref) return pref;

    // Default: INSTANT delivery, no quiet hours
    const defaultPref = this.preferencesRepository.create({
      userId,
      channel,
      frequency: NotificationFrequency.INSTANT,
      quietHours: null,
    });
    return defaultPref;
  }

  // -------------------------------------------------------------------------
  // create — the main delivery entry-point
  // -------------------------------------------------------------------------

  async create(
    userAddress: string,
    type: NotificationType | string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
    /**
     * Optional userId (UUID). When provided the method looks up the user's
     * notification preferences and applies frequency/quiet-hours rules.
     * When omitted the original instant-delivery behaviour is preserved.
     */
    userId?: string,
  ): Promise<Notification> {
    const notification = this.notificationsRepository.create({
      user_address: userAddress,
      type,
      title,
      message,
      data: data ?? null,
    });
    const saved = await this.notificationsRepository.save(notification);

    if (!userId) {
      // Legacy path — no preference lookup, deliver immediately
      this.deliverInstant(userAddress, saved);
      return saved;
    }

    const pref = await this.getPreference(userId, NotificationChannel.IN_APP);

    // Respect quiet hours: during quiet window, always defer regardless of frequency
    if (pref.quietHours && isInQuietHours(pref.quietHours)) {
      this.enqueue(userAddress, saved, pref.frequency);
      return saved;
    }

    switch (pref.frequency) {
      case NotificationFrequency.INSTANT:
        this.deliverInstant(userAddress, saved);
        break;
      case NotificationFrequency.HOURLY:
        this.enqueue(userAddress, saved, NotificationFrequency.HOURLY);
        break;
      case NotificationFrequency.DAILY:
        this.enqueue(userAddress, saved, NotificationFrequency.DAILY);
        break;
    }

    return saved;
  }

  // -------------------------------------------------------------------------
  // Instant delivery (WebSocket broadcast)
  // -------------------------------------------------------------------------

  private deliverInstant(userAddress: string, saved: Notification): void {
    this.notificationBroadcaster.broadcastNewNotification(userAddress, {
      id: saved.id,
      type: saved.type,
      title: saved.title,
      message: saved.message,
      data: saved.data ?? undefined,
      created_at: saved.created_at,
    });
  }

  // -------------------------------------------------------------------------
  // Pending-bucket management
  // -------------------------------------------------------------------------

  private enqueue(
    userAddress: string,
    notification: Notification,
    frequency: NotificationFrequency,
  ): void {
    const key = `${frequency}:${userAddress}`;
    const bucket = this.pendingBuckets.get(key) ?? [];
    bucket.push({ userAddress, notification, enqueuedAt: new Date() });
    this.pendingBuckets.set(key, bucket);
  }

  /**
   * Idempotent drain: returns (and removes from the bucket) all entries for
   * the given frequency and userAddress.  Calling it twice returns nothing on
   * the second call — preventing duplicates.
   */
  drainPending(
    userAddress: string,
    frequency: NotificationFrequency,
  ): Notification[] {
    const key = `${frequency}:${userAddress}`;
    const bucket = this.pendingBuckets.get(key) ?? [];
    this.pendingBuckets.delete(key);
    return bucket.map((e) => e.notification);
  }

  /**
   * Returns all userAddresses that have pending entries for the given frequency.
   * Used by the digest scheduler to discover who needs a batch digest.
   */
  getPendingUsers(frequency: NotificationFrequency): string[] {
    const prefix = `${frequency}:`;
    return Array.from(this.pendingBuckets.keys())
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }

  // -------------------------------------------------------------------------
  // Query / mutation methods (unchanged from original)
  // -------------------------------------------------------------------------

  async findAllForUser(
    userAddress: string,
    page = 1,
    limit = 20,
    readFilter?: boolean,
    type?: string,
  ): Promise<{
    data: Notification[];
    total: number;
    page: number;
    limit: number;
    unreadCount: number;
  }> {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = { user_address: userAddress };
    if (readFilter !== undefined) {
      where.read = readFilter;
    }
    if (type) {
      where.type = type;
    }

    const [data, total] = await this.notificationsRepository.findAndCount({
      where: where as FindOptionsWhere<Notification>,
      order: { created_at: 'DESC' },
      skip,
      take,
    });

    const unreadCount = await this.notificationsRepository.count({
      where: { user_address: userAddress, read: false },
    });

    return { data, total, page, limit: take, unreadCount };
  }

  async markAsRead(id: number, userAddress: string): Promise<void> {
    const result = await this.notificationsRepository.update(
      { id, user_address: userAddress },
      { read: true },
    );

    if (!result.affected) {
      throw new NotFoundException('Notification not found');
    }

    this.notificationBroadcaster.broadcastNotificationRead(userAddress, id);
  }

  async markAllAsRead(userAddress: string): Promise<{ updated: number }> {
    const result = await this.notificationsRepository.update(
      { user_address: userAddress, read: false },
      { read: true },
    );

    return { updated: result.affected ?? 0 };
  }

  async markMultipleAsRead(
    userAddress: string,
    notificationIds: number[],
  ): Promise<{ updated: number }> {
    const result = await this.notificationsRepository.update(
      { user_address: userAddress, id: In(notificationIds) },
      { read: true },
    );

    return { updated: result.affected ?? 0 };
  }

  async remove(id: number, userAddress: string): Promise<void> {
    const notification = await this.notificationsRepository.findOne({
      where: { id, user_address: userAddress },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.notificationsRepository.softDelete(id);
  }

  async getUnreadCount(userAddress: string): Promise<number> {
    return this.notificationsRepository.count({
      where: { user_address: userAddress, read: false },
    });
  }

  // -------------------------------------------------------------------------
  // Preferences CRUD (exposed via controller)
  // -------------------------------------------------------------------------

  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    return this.preferencesRepository.find({ where: { userId } });
  }

  async upsertPreference(
    userId: string,
    channel: NotificationChannel,
    frequency: NotificationFrequency,
    quietHours?: string | null,
  ): Promise<NotificationPreference> {
    let pref = await this.preferencesRepository.findOne({
      where: { userId, channel },
    });

    if (!pref) {
      pref = this.preferencesRepository.create({ userId, channel });
    }

    pref.frequency = frequency;
    pref.quietHours = quietHours !== undefined ? quietHours : pref.quietHours;

    return this.preferencesRepository.save(pref);
  }
}
