import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('fee_history')
export class FeeHistory {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'bigint' })
  @ApiProperty()
  old_fee_stroops: string;

  @Column({ type: 'bigint' })
  @ApiProperty()
  new_fee_stroops: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiProperty()
  updated_by: string | null;

  @Column({ type: 'bigint', nullable: true })
  @ApiProperty()
  ledger: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiProperty()
  tx_hash: string | null;

  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;
}
