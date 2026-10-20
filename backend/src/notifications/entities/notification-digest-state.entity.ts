import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('notification_digest_state')
@Index(['userId'], { unique: true })
export class NotificationDigestState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'last_daily_period', type: 'varchar', nullable: true })
  lastDailyPeriod: string | null;

  @Column({ name: 'last_weekly_period', type: 'varchar', nullable: true })
  lastWeeklyPeriod: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
