import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Immutable audit trail of reliability score changes. A new row is recorded
 * every time an oracle's score is updated after a match is resolved (#1765).
 *
 * This allows tracing the historical evolution of oracle reliability and
 * reconstructing weighted consensus decisions at any point in time.
 */
@Entity('oracle_reliability_history')
@Index(['data_source', 'created_at'])
@Index(['data_source'])
export class OracleReliabilityHistory {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id?: string;

  @Column({ type: 'varchar', length: 500 })
  @Index()
  @ApiProperty()
  data_source?: string;

  /** The match ID that triggered this reliability update. */
  @Column({ type: 'varchar', length: 255 })
  @ApiProperty()
  match_id?: string;

  /**
   * Whether the oracle's submission for this match was correct.
   * Used to calculate the reliability score update.
   */
  @Column({ type: 'boolean' })
  @ApiProperty()
  was_correct?: boolean;

  /**
   * Reliability score before this update (snapshot for audit trail).
   * Null if this is the first outcome recorded for the source.
   */
  @Column({ type: 'double precision', nullable: true })
  @ApiProperty()
  previous_score?: number | null;

  /**
   * Reliability score after this update (computed as
   * correct_submissions / total_submissions).
   * Bounded in [0, 1].
   */
  @Column({ type: 'double precision' })
  @ApiProperty()
  new_score?: number;

  /**
   * Total submissions for the source at the time of this update.
   */
  @Column({ type: 'int' })
  @ApiProperty()
  total_submissions?: number;

  /**
   * Correct submissions for the source at the time of this update.
   */
  @Column({ type: 'int' })
  @ApiProperty()
  correct_submissions?: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  created_at?: Date;
}
