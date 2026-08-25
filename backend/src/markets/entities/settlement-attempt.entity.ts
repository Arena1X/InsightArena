import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Market } from './market.entity';

/**
 * Status transitions for a single settlement attempt on a market.
 * RESOLVING -> RESOLVED on a successful on-chain call, RESOLVING -> FAILED
 * on a rejected/errored call. A market stuck at RESOLVING past the stale
 * threshold (see MarketSettlementScheduler) is presumed crashed and is
 * picked back up by a fresh attempt.
 */
export enum SettlementAttemptStatus {
  RESOLVING = 'resolving',
  RESOLVED = 'resolved',
  FAILED = 'failed',
}

@Entity('settlement_attempts')
@Index(['market'])
@Index(['status'])
@Index(['market', 'created_at'])
export class SettlementAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Market, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'market_id' })
  market: Market;

  @Column({ type: 'uuid' })
  market_id: string;

  @Column({
    type: 'varchar',
    enum: SettlementAttemptStatus,
    default: SettlementAttemptStatus.RESOLVING,
  })
  status: SettlementAttemptStatus;

  @Column({ type: 'varchar', nullable: true })
  proposed_outcome: string | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;
}