import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('leaderboard_history')
@Index(['snapshot_date'])
@Index(['user_id'])
@Index(['season_id'])
@Unique('UQ_leaderboard_history_user_date_season', [
  'user_id',
  'snapshot_date',
  'season_id',
])
export class LeaderboardHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  user_id: string;

  @Column({ type: 'date' })
  snapshot_date: Date;

  @Column({ default: 0 })
  rank: number;

  @Column({ default: 0 })
  reputation_score: number;

  @Column({ default: 0 })
  season_points: number;

  @Column({ default: 0 })
  total_predictions: number;

  @Column({ default: 0 })
  correct_predictions: number;

  @Column({ type: 'bigint', default: 0 })
  total_winnings_stroops: string;

  @Column({ nullable: true })
  season_id: string;

  @CreateDateColumn()
  created_at: Date;
}
