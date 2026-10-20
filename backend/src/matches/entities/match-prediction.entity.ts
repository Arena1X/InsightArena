import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { Match } from './match.entity';
import { User } from '../../users/entities/user.entity';

export enum PredictedOutcome {
  TEAM_A = 'TEAM_A',
  TEAM_B = 'TEAM_B',
  DRAW = 'DRAW',
}

@Entity('match_predictions')
@Index(['match'])
@Index(['user'])
@Unique('UQ_user_match_prediction', ['user', 'match'])
export class MatchPrediction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Match, (match) => match.predictions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: PredictedOutcome,
  })
  predicted_outcome: PredictedOutcome;

  @Column({ type: 'int', nullable: true })
  predicted_home_score: number | null;

  @Column({ type: 'int', nullable: true })
  predicted_away_score: number | null;

  @Column({ type: 'int', default: 0 })
  points_earned: number;

  @Column({ type: 'boolean', nullable: true })
  is_correct: boolean | null;

  @CreateDateColumn()
  predicted_at: Date;
}
