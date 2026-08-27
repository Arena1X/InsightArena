import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ default: true })
  email_notifications: boolean;

  @Column({ default: true })
  market_resolution_notifications: boolean;

  @Column({ default: true })
  competition_notifications: boolean;

  @Column({ default: true })
  leaderboard_notifications: boolean;

  @Column({ default: false })
  marketing_emails: boolean;

  @Column({ default: true })
  event_created_notifications: boolean;

  @Column({ default: true })
  match_added_notifications: boolean;

  @Column({ default: true })
  prediction_submitted_notifications: boolean;

  @Column({ default: true })
  match_resolved_notifications: boolean;

  @Column({ default: true })
  winner_verified_notifications: boolean;

  @Column({ default: true })
  event_cancelled_notifications: boolean;

  @Column({ type: 'varchar', default: 'off' })
  digest_frequency: 'daily' | 'weekly' | 'off';

  /** Delivery hour (0-23) in the user's local time, per `digest_timezone`. */
  @Column({ type: 'int', default: 8 })
  digest_hour: number;

  /** IANA timezone name (e.g. "America/Chicago", "Europe/Lagos"). */
  @Column({ type: 'varchar', default: 'UTC' })
  digest_timezone: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
