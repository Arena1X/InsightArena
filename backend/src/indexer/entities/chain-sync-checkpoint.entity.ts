import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('chain_sync_checkpoints')
export class ChainSyncCheckpoint {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  @ApiProperty({ description: 'Contract ID this checkpoint tracks' })
  contract_id: string;

  @Column({ type: 'bigint', default: 0 })
  @ApiProperty({
    description: 'Last ledger successfully indexed and persisted',
  })
  last_indexed_ledger: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  @ApiProperty({
    description: 'Hash of last_indexed_ledger, used to detect chain reorgs',
  })
  last_indexed_ledger_hash: string | null;

  @Column({ type: 'bigint', default: 0 })
  @ApiProperty({ description: 'Latest known chain-head ledger' })
  chain_head_ledger: number;

  @Column({ type: 'bigint', default: 0 })
  @ApiProperty({
    description: 'Ledger from which the last reconciliation started',
  })
  last_reconciled_from: number;

  @Column({ type: 'bigint', default: 0 })
  @ApiProperty({ description: 'Ledger at which the last reconciliation ended' })
  last_reconciled_to: number;

  @Column({ type: 'timestamptz', nullable: true })
  @ApiProperty({
    description: 'Timestamp of the last successful reconciliation',
  })
  last_reconciled_at: Date | null;

  @Column({ type: 'int', default: 0 })
  @ApiProperty({
    description: 'Number of events backfilled in the last reconciliation run',
  })
  last_backfill_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
