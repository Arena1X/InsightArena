import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('reorg_events')
export class ReorgEvent {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', length: 128 })
  @Index()
  @ApiProperty({ description: 'Contract ID this reorg was detected on' })
  contract_id: string;

  @Column({ type: 'bigint' })
  @ApiProperty({ description: 'Ledger rolled back to (last known-good point)' })
  fork_ledger: number;

  @Column({ type: 'bigint' })
  @ApiProperty({
    description: 'Ledger that was found to have diverged from canonical chain',
  })
  previous_ledger: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  @ApiProperty({ description: 'Hash previously stored for previous_ledger' })
  previous_hash: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  @ApiProperty({
    description: 'Hash the chain now reports for previous_ledger',
  })
  new_hash: string | null;

  @Column({ type: 'int' })
  @ApiProperty({ description: 'Number of ContractEvent rows rolled back' })
  rolled_back_event_count: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  detected_at: Date;
}
