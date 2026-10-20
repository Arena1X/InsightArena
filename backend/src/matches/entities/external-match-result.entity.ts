import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Match, WinningTeam } from './match.entity';

export enum ExternalResultStatus {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
}

@Entity('external_match_results')
@Index(['match'], { unique: true })
export class ExternalMatchResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column({ type: 'varchar', length: 255 })
  external_id: string;

  @Column({ type: 'int' })
  home_score: number;

  @Column({ type: 'int' })
  away_score: number;

  @Column({ type: 'enum', enum: WinningTeam })
  winning_team: WinningTeam;

  @Column({
    type: 'enum',
    enum: ExternalResultStatus,
    default: ExternalResultStatus.PENDING_CONFIRMATION,
  })
  status: ExternalResultStatus;

  @CreateDateColumn()
  created_at: Date;
}
