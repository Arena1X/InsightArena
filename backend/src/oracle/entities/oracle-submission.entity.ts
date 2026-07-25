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

/**
 * Governs the manual-review lifecycle for a submission flagged as a statistical
 * anomaly (#1364).
 *
 * - `NOT_REQUIRED` — normal submission, no manual review needed (default).
 * - `HELD` — flagged and withheld from on-chain submission pending admin review.
 * - `APPROVED` — an admin approved a held submission; it may now be used.
 * - `REJECTED` — an admin rejected a held submission; it must never be used.
 */
export enum SubmissionReviewStatus {
  NOT_REQUIRED = 'not_required',
  HELD = 'held',
  APPROVED = 'approved',
  REJECTED = 'rejected',
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
@Index(['data_source', 'created_at'])
@Index(['review_status'])
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

  /**
   * `true` when anomaly detection flagged this submission's confidence score as
   * a statistical outlier relative to its data source's rolling baseline (#1364).
   */
  @Column({ type: 'boolean', default: false })
  @Index()
  @ApiProperty()
  is_anomaly: boolean;

  /**
   * Absolute z-score of the confidence score against the data source's rolling
   * baseline at submission time. `null` when the baseline had too few samples
   * to evaluate. Recorded for transparency even when below the flag threshold.
   */
  @Column({ type: 'double precision', nullable: true })
  @ApiPropertyOptional()
  anomaly_score?: number;

  @Column({
    type: 'enum',
    enum: SubmissionReviewStatus,
    default: SubmissionReviewStatus.NOT_REQUIRED,
  })
  @ApiProperty()
  review_status: SubmissionReviewStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiPropertyOptional()
  reviewed_by?: string;

  @Column({ type: 'timestamptz', nullable: true })
  @ApiPropertyOptional()
  reviewed_at?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  created_at: Date;
}
