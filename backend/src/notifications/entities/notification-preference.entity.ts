import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** Delivery frequency that a user can choose per channel. */
export enum NotificationFrequency {
  INSTANT = 'INSTANT',
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
}

/** Notification delivery channel. */
export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
}

@Entity('notification_preferences')
@Index(['userId', 'channel'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The application user UUID. */
  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'varchar',
    enum: NotificationChannel,
    default: NotificationChannel.IN_APP,
  })
  channel: NotificationChannel;

  /**
   * Delivery frequency.
   * - INSTANT  → send immediately (current behaviour)
   * - HOURLY   → enqueue; flush every hour
   * - DAILY    → enqueue; flush once per day
   */
  @Column({
    type: 'varchar',
    enum: NotificationFrequency,
    default: NotificationFrequency.INSTANT,
  })
  frequency: NotificationFrequency;

  /**
   * Quiet-hours window expressed as "HH:MM-HH:MM" in UTC,
   * e.g. "22:00-07:00". Null means no quiet hours.
   * Notifications received during this window are deferred to the next
   * allowed window — never dropped.
   */
  @Column({ type: 'varchar', length: 11, nullable: true })
  quietHours: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
