import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Grants a data source permission to report match results for one event.
 * A submission is only accepted when an active row here matches both the
 * reporting data_source and the event the submitted match belongs to —
 * `is_active` lets an assignment be revoked without deleting its history.
 */
@Entity('oracle_assignments')
@Index(['data_source', 'event_id'], { unique: true })
export class OracleAssignment {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', length: 500 })
  @Index()
  @ApiProperty()
  data_source: string;

  @Column({ type: 'uuid' })
  @Index()
  @ApiProperty()
  event_id: string;

  @Column({ type: 'boolean', default: true })
  @ApiProperty()
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  created_at: Date;
}
