import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationType {
  /** Notification sent when a market is resolved with an outcome */
  MARKET_RESOLVED = 'market_resolved',
  /** Notification sent when a payout is ready for claiming */
  PAYOUT_READY = 'payout_ready',
  /** Notification sent when a user's rank changes in a leaderboard */
  RANK_CHANGED = 'rank_changed',
  /** Notification sent when a competition starts */
  COMPETITION_STARTED = 'competition_started',
  /** Notification sent when a competition ends */
  COMPETITION_ENDED = 'competition_ended',
  /** Notification sent when a user's prediction wins */
  PREDICTION_WON = 'prediction_won',
  /** Notification sent when a user's prediction loses */
  PREDICTION_LOST = 'prediction_lost',
}

@Index(['user_id', 'is_read'])
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  user_id: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: false })
  is_read: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}
