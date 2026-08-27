import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Competition } from './competition.entity';

export enum BracketStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
}

@Entity('competition_brackets')
@Index(['competition_id'], { unique: true })
export class CompetitionBracket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  competition_id: string;

  @ManyToOne(() => Competition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competition_id' })
  competition: Competition;

  @Column({ type: 'int' })
  total_rounds: number;

  @Column({
    type: 'varchar',
    enum: BracketStatus,
    default: BracketStatus.Pending,
  })
  status: BracketStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  generated_at: Date;
}
