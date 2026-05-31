import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SubmissionStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  FAILED = 'failed',
}

export enum WinningTeam {
  TEAM_A = 'TEAM_A',
  TEAM_B = 'TEAM_B',
  DRAW = 'DRAW',
}

@Entity('oracle_submissions')
@Index(['match_id'])
@Index(['status'])
@Index(['created_at'])
@Index(['match_id', 'status'])
@Index(['created_at', 'status'])
export class OracleSubmission {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  @ApiProperty()
  match_id: string;

  @Column({ type: 'varchar', length: 100 })
  @ApiProperty()
  team_a: string;

  @Column({ type: 'varchar', length: 100 })
  @ApiProperty()
  team_b: string;

  @Column({
    type: 'enum',
    enum: WinningTeam,
  })
  @ApiProperty()
  winning_team: WinningTeam;

  @Column({ type: 'int' })
  @ApiProperty()
  confidence_score: number;

  @Column({ type: 'varchar', length: 500 })
  @ApiProperty()
  data_source: string;

  @Column({ type: 'timestamptz' })
  @ApiProperty()
  result_timestamp: Date;

  @Column({ type: 'jsonb', nullable: true })
  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    default: SubmissionStatus.PENDING,
  })
  @ApiProperty()
  status: SubmissionStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiPropertyOptional()
  transaction_hash?: string;

  @Column({ type: 'timestamptz', nullable: true })
  @ApiPropertyOptional()
  submitted_at?: Date;

  @Column({ type: 'text', nullable: true })
  @ApiPropertyOptional()
  error_message?: string;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  retry_count: number;

  @Column({ type: 'bigint', nullable: true })
  @ApiPropertyOptional()
  submission_time_ms?: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  created_at: Date;
}
