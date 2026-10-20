import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Season } from './season.entity';
import { User } from '../../users/entities/user.entity';

export enum DistributionLedgerStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

/**
 * Per-recipient audit row for season prize distribution. A unique row per
 * (season, recipient) makes rollover resumable: re-running only completes
 * rows that are still PENDING or FAILED — a SUCCEEDED row is never re-paid.
 */
@Entity('season_distribution_ledger')
@Index(['season', 'recipient'], { unique: true })
export class SeasonDistributionLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Season, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'season_id' })
  season: Season;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'recipient_user_id' })
  recipient: User | null;

  @Column({ type: 'varchar', length: 64 })
  recipient_stellar_address: string;

  @Column({ type: 'bigint' })
  amount_stroops: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: DistributionLedgerStatus.PENDING,
  })
  status: DistributionLedgerStatus;

  @Column({ type: 'text', nullable: true })
  failure_reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
