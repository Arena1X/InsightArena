import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Season } from './season.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Immutable per-user leaderboard row captured atomically at season rollover.
 * Unique on (season, user) so a rollover retry can never duplicate rows for
 * a season that already has a snapshot — see SeasonsService.processSeasonRollover.
 */
@Entity('season_leaderboard_snapshots')
@Index(['season', 'user'], { unique: true })
@Index(['season', 'rank'])
export class SeasonLeaderboardSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Season, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'season_id' })
  season: Season;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int' })
  rank: number;

  @Column({ type: 'int' })
  season_points: number;

  @CreateDateColumn({ type: 'timestamptz' })
  captured_at: Date;
}
