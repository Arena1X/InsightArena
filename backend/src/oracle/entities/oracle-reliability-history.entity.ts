import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('oracle_reliability_history')
@Index(['data_source', 'created_at'])
export class OracleReliabilityHistory {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', length: 500 })
  @ApiProperty()
  data_source: string;

  @Column({ type: 'boolean' })
  @ApiProperty()
  was_correct: boolean;

  @Column({ type: 'double precision' })
  @ApiProperty()
  reliability_score: number;

  @Column({ type: 'int' })
  @ApiProperty()
  total_submissions: number;

  @Column({ type: 'int' })
  @ApiProperty()
  correct_submissions: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiProperty({ required: false })
  match_id?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  created_at: Date;
}
