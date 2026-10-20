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

@Entity('leaderboard_snapshots')
@Index(['season_id', 'captured_at'])
@Index(['user_id', 'captured_at'])
@Unique('UQ_leaderboard_snapshots_user_season_captured', [
  'user_id',
  'season_id',
  'captured_at',
])
export class LeaderboardSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  user_id: string;

  @Column({ nullable: true })
  season_id: string | null;

  @Column({ type: 'timestamptz' })
  captured_at: Date;

  @Column({ default: 0 })
  rank: number;

  /**
   * season_points for a season snapshot, reputation_score for an all-time snapshot -
   * mirrors the ordering field used by LeaderboardService.getLeaderboard for the same scope.
   */
  @Column({ default: 0 })
  score: number;

  @CreateDateColumn()
  created_at: Date;
}
