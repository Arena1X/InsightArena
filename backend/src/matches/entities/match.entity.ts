import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { CreatorEvent } from './creator-event.entity';
import { MatchPrediction } from './match-prediction.entity';

export enum WinningTeam {
  TEAM_A = 'TEAM_A',
  TEAM_B = 'TEAM_B',
  DRAW = 'DRAW',
}

export enum MatchDisputeStatus {
  DISPUTED_SOURCE = 'DISPUTED_SOURCE',
}

@Entity('event_matches')
@Index(['on_chain_match_id'], { unique: true })
@Index(['event'])
@Index(['result_submitted'])
@Index(['result_submitted', 'match_time'])
@Index(['match_time'])
@Index(['submitted_by'])
@Index(['external_id'], { unique: true })
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint' })
  on_chain_match_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  external_id: string | null;

  @ManyToOne(() => CreatorEvent, (event) => event.matches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'event_id' })
  event: CreatorEvent;

  @Column({ type: 'varchar', length: 100 })
  team_a: string;

  @Column({ type: 'varchar', length: 100 })
  team_b: string;

  @Column({ type: 'timestamptz' })
  match_time: Date;

  @Column({ default: false })
  result_submitted: boolean;

  @Column({ type: 'int', nullable: true })
  home_score: number | null;

  @Column({ type: 'int', nullable: true })
  away_score: number | null;

  @Column({ type: 'int', default: 1 })
  points_multiplier: number;

  @Column({
    type: 'enum',
    enum: WinningTeam,
    nullable: true,
  })
  winning_team: WinningTeam | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  submitted_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null;

  @Column({
    type: 'enum',
    enum: MatchDisputeStatus,
    nullable: true,
  })
  dispute_status: MatchDisputeStatus | null;

  @OneToMany(() => MatchPrediction, (prediction) => prediction.match)
  predictions: MatchPrediction[];

  @CreateDateColumn()
  created_at: Date;
}
