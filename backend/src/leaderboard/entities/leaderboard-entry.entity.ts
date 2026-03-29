import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('leaderboard_entries')
@Index(['season_id', 'rank'])
@Unique('UQ_leaderboard_entries_user_season', ['user_id', 'season_id'])
export class LeaderboardEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ name: 'user_id' })
  user_id: string;

  @Column({ nullable: true })
  season_id: string;

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

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
