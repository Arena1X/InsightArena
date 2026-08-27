import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('oracle_source_reliability')
@Index(['data_source'], { unique: true })
export class OracleSourceReliability {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', length: 500 })
  @ApiProperty()
  data_source: string;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  total_submissions: number;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  correct_submissions: number;

  /**
   * Reliability score in [0, 1]: correct_submissions / total_submissions.
   * Null until at least one outcome has been finalized against this source.
   */
  @Column({ type: 'double precision', nullable: true })
  @ApiProperty()
  reliability_score: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  updated_at: Date;
}
