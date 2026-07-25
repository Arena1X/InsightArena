import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * An immutable audit record of a single anomaly-detection flag raised against an
 * oracle submission (#1364).
 *
 * One row is written each time a submission's confidence score deviates beyond
 * the configured threshold from its data source's rolling baseline. The row
 * captures the full statistical evidence (baseline mean/stddev, deviation,
 * threshold, sample size) so an admin can audit *why* a submission was flagged
 * without recomputing anything. Flags are never mutated after creation; the
 * hold/approve/reject lifecycle lives on the submission's `review_status`.
 */
@Entity('oracle_submission_flags')
@Index(['data_source', 'created_at'])
@Index(['submission_id'])
@Index(['held'])
export class OracleSubmissionFlag {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  /** FK to the flagged `oracle_submissions.id`. */
  @Column({ type: 'uuid' })
  @Index()
  @ApiProperty()
  submission_id: string;

  @Column({ type: 'varchar', length: 255 })
  @ApiProperty()
  match_id: string;

  @Column({ type: 'varchar', length: 500 })
  @ApiProperty()
  data_source: string;

  /** The confidence score that was evaluated against the baseline. */
  @Column({ type: 'double precision' })
  @ApiProperty()
  observed_value: number;

  /** Mean confidence score of the data source's rolling baseline window. */
  @Column({ type: 'double precision' })
  @ApiProperty()
  baseline_mean: number;

  /** Population standard deviation of the rolling baseline window. */
  @Column({ type: 'double precision' })
  @ApiProperty()
  baseline_stddev: number;

  /**
   * Absolute deviation in standard deviations (z-score):
   * `|observed_value - baseline_mean| / baseline_stddev`. When the baseline
   * stddev is 0 and the observed value differs, this is stored as the
   * sentinel value used by the detector (a large finite number).
   */
  @Column({ type: 'double precision' })
  @ApiProperty()
  deviation: number;

  /** The configured z-score threshold in effect when the flag was raised. */
  @Column({ type: 'double precision' })
  @ApiProperty()
  threshold: number;

  /** Number of prior submissions that formed the baseline window. */
  @Column({ type: 'int' })
  @ApiProperty()
  sample_size: number;

  /** `true` when the flag caused the submission to be held for manual review. */
  @Column({ type: 'boolean', default: false })
  @ApiProperty()
  held: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @ApiPropertyOptional()
  reason?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  created_at: Date;
}
