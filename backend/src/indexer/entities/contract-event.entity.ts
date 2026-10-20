import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum ContractEventStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
  DLQ = 'dlq',
}

@Entity('contract_events')
@Index(['ledger', 'log_index'])
@Index(['status'])
@Index(['event_type'])
@Index(['created_at'])
export class ContractEvent {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'bigint' })
  @ApiProperty()
  ledger: number;

  @Column({ type: 'int' })
  @ApiProperty()
  log_index: number;

  @Column({ type: 'varchar', length: 128 })
  @ApiProperty()
  event_type: string;

  @Column({ type: 'jsonb' })
  @ApiProperty()
  data: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiProperty()
  tx_hash: string | null;

  @Column({
    type: 'enum',
    enum: ContractEventStatus,
    default: ContractEventStatus.PENDING,
  })
  @ApiProperty({ enum: ContractEventStatus })
  status: ContractEventStatus;

  @Column({ type: 'text', nullable: true })
  @ApiProperty()
  error_message: string | null;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  retry_count: number;

  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  @ApiProperty()
  processed_at: Date | null;
}
