import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { NotificationDigestState } from './entities/notification-digest-state.entity';
import { EmailService } from './email.service';
import {
  renderEmailTemplate,
  DigestGroup,
  DigestItem,
} from './email-templates';

/** Maximum notification rows shown in a single digest email. */
export const DIGEST_MAX_ITEMS = 10;

const DIGEST_CATEGORY_LABELS: Record<string, string> = {
  event_created: 'Events',
  match_added: 'Matches',
  prediction_submitted: 'Predictions',
  match_resolved: 'Results',
  winner_verified: 'Wins',
  event_cancelled: 'Events',
  dispute_sla_approaching: 'Disputes',
  dispute_sla_breached: 'Disputes',
};

export interface AggregatedDigest {
  groups: DigestGroup[];
  overflowCount: number;
  totalUnique: number;
}

export function aggregateDigestNotifications(
  notifications: Notification[],
  maxItems: number = DIGEST_MAX_ITEMS,
): AggregatedDigest {
  const seen = new Set<string>();
  const unique = notifications.filter((notification) => {
    const key = `${notification.type}:${notification.title}:${notification.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const grouped = new Map<string, DigestItem[]>();
  for (const notification of unique) {
    const category =
      DIGEST_CATEGORY_LABELS[notification.type] ?? 'Notifications';
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push({
      title: notification.title,
      message: notification.message,
    });
  }

  const groups: DigestGroup[] = [];
  let displayed = 0;
  let overflowCount = 0;

  for (const [category, items] of grouped.entries()) {
    const visibleItems: DigestItem[] = [];
    for (const item of items) {
      if (displayed >= maxItems) {
        overflowCount++;
        continue;
      }
      visibleItems.push(item);
      displayed++;
    }

    if (visibleItems.length > 0) {
      groups.push({ category, items: visibleItems });
    }
  }

  return {
    groups,
    overflowCount,
    totalUnique: unique.length,
  };
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    @InjectRepository(UserPreferences)
    private readonly prefsRepo: Repository<UserPreferences>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationDigestState)
    private readonly digestStateRepo: Repository<NotificationDigestState>,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  // Fires every hour on the hour. For each hour-of-day, only users whose
  // digest_timezone currently reads that local hour (and whose digest_hour
  // matches) are candidates — batched per distinct timezone rather than
  // iterating every individual user's own offset.
  @Cron('0 0 * * * *')
  async handleHourlyCheck(now = new Date()): Promise<void> {
    if (this.config.get<string>('DIGEST_ENABLED') === 'false') return;

    const weekDay = parseInt(
      this.config.get<string>('DIGEST_WEEKLY_DAY') ?? '1',
      10,
    );

    const timezones = await this.getActiveTimezones();

    for (const timezone of timezones) {
      let localHour: number;
      let localWeekday: number;
      try {
        localHour = this.getLocalHour(now, timezone);
        localWeekday = this.getLocalWeekday(now, timezone);
      } catch (err) {
        this.logger.warn(
          `Skipping digest_timezone "${timezone}": unrecognized IANA zone (${err instanceof Error ? err.message : String(err)})`,
        );
        continue;
      }

      await this.sendDailyDigests(now, timezone, localHour);

      if (localWeekday === weekDay) {
        await this.sendWeeklyDigests(now, timezone, localHour);
      }
    }
  }

  /** Distinct timezones in use among users who have digests turned on. */
  private async getActiveTimezones(): Promise<string[]> {
    const rows = await this.prefsRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.digest_timezone', 'digest_timezone')
      .where('p.digest_frequency != :off', { off: 'off' })
      .andWhere('p.email_notifications = true')
      .getRawMany<{ digest_timezone: string }>();

    return rows.map((r) => r.digest_timezone);
  }

  async sendDailyDigests(
    now: Date,
    timezone: string,
    hour: number,
  ): Promise<void> {
    const periodKey = this.getLocalDailyPeriodKey(now, timezone);
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    this.logger.log(
      `Running daily digest for ${timezone} @ ${hour}:00 local, period ${periodKey}`,
    );
    await this.runDigests('daily', periodKey, windowStart, timezone, hour);
  }

  async sendWeeklyDigests(
    now: Date,
    timezone: string,
    hour: number,
  ): Promise<void> {
    const periodKey = this.getLocalWeeklyPeriodKey(now, timezone);
    const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    this.logger.log(
      `Running weekly digest for ${timezone} @ ${hour}:00 local, period ${periodKey}`,
    );
    await this.runDigests('weekly', periodKey, windowStart, timezone, hour);
  }

  private async runDigests(
    frequency: 'daily' | 'weekly',
    periodKey: string,
    windowStart: Date,
    timezone: string,
    hour: number,
  ): Promise<void> {
    const prefs = await this.prefsRepo.find({
      where: {
        digest_frequency: frequency,
        email_notifications: true,
        digest_timezone: timezone,
        digest_hour: hour,
      },
    });

    for (const pref of prefs) {
      try {
        await this.processUserDigest(pref, frequency, periodKey, windowStart);
      } catch (err) {
        this.logger.error(
          `Digest failed for user ${pref.userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async processUserDigest(
    pref: UserPreferences,
    frequency: 'daily' | 'weekly',
    periodKey: string,
    windowStart: Date,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: pref.userId } });
    if (!user?.email) return;

    // idempotency: skip if this period was already sent
    let state = await this.digestStateRepo.findOne({
      where: { userId: pref.userId },
    });
    const lastPeriod =
      frequency === 'daily' ? state?.lastDailyPeriod : state?.lastWeeklyPeriod;
    if (lastPeriod === periodKey) return;

    // fetch unread notifications created in the window (cap at 20 items)
    const notifications = await this.notificationRepo.find({
      where: {
        user_address: user.stellar_address,
        read: false,
        created_at: MoreThanOrEqual(windowStart),
      },
      order: { created_at: 'DESC' },
      take: 20,
    });

    // skip users with nothing to report — no email queued, no state written
    if (notifications.length === 0) return;

    const aggregated = aggregateDigestNotifications(notifications);

    const rendered = renderEmailTemplate('digest', {
      digestFrequency: frequency,
      digestGroups: aggregated.groups,
      digestOverflowCount: aggregated.overflowCount,
      digestPeriod: periodKey,
    });

    await this.emailService.queueEmail({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    // persist sent period to prevent duplicates
    if (!state) {
      state = this.digestStateRepo.create({ userId: pref.userId });
    }
    if (frequency === 'daily') {
      state.lastDailyPeriod = periodKey;
    } else {
      state.lastWeeklyPeriod = periodKey;
    }
    await this.digestStateRepo.save(state);

    this.logger.log(
      `Digest sent to ${user.email} (${frequency}, ${periodKey}, ${aggregated.totalUnique} items, ${aggregated.overflowCount} overflow)`,
    );
  }

  // ── Timezone-aware time helpers ─────────────────────────────────────────
  //
  // Using Intl.DateTimeFormat with an explicit `timeZone` rather than a
  // manual UTC-offset table means DST transitions are handled correctly for
  // free — the JS engine's ICU data already knows every zone's rules.

  /** The local hour-of-day (0-23) in `timezone` at instant `date`. */
  private getLocalHour(date: Date, timezone: string): number {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      hour: '2-digit',
    }).format(date);
    return parseInt(formatted, 10);
  }

  /** The local day-of-week in `timezone`, 0 = Sunday .. 6 = Saturday. */
  private getLocalWeekday(date: Date, timezone: string): number {
    const weekdayNames = [
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ] as const;
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(date);
    const index = weekdayNames.indexOf(
      formatted as (typeof weekdayNames)[number],
    );
    return index;
  }

  /** The local calendar date in `timezone`, as "YYYY-MM-DD". */
  private getLocalDateParts(
    date: Date,
    timezone: string,
  ): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

    return { year: get('year'), month: get('month'), day: get('day') };
  }

  private getLocalDailyPeriodKey(date: Date, timezone: string): string {
    const { year, month, day } = this.getLocalDateParts(date, timezone);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private getLocalWeeklyPeriodKey(date: Date, timezone: string): string {
    const { year, month, day } = this.getLocalDateParts(date, timezone);
    // Build a UTC Date carrying the *local* y/m/d so ISO-week math below
    // operates on the user's local calendar date, not the instant's UTC date.
    const d = new Date(Date.UTC(year, month - 1, day));
    const isoDay = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - isoDay);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
}
