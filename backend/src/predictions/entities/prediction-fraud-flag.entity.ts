import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum FraudSignalType {
  TIMING_CLUSTERING = 'timing_clustering',
  COUNTERPARTY_CONCENTRATION = 'counterparty_concentration',
}

export enum FraudFlagStatus {
  OPEN = 'open',
  REVIEWED = 'reviewed',
  DISMISSED = 'dismissed',
}

/**
 * Advisory-only record of a suspicious prediction pattern. Created when a
 * computed signal (see PredictionsService.evaluateFraudSignalsForUser)
 * exceeds its configured threshold. Never drives automatic enforcement -
 * admins review and resolve flags manually.
 */
@Entity('prediction_fraud_flags')
@Index(['user_id'])
@Index(['signal_type'])
@Index(['status'])
export class PredictionFraudFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: FraudSignalType })
  signal_type: FraudSignalType;

  @Column({ type: 'float' })
  score: number;

  @Column({ type: 'float' })
  threshold: number;

  @Column({ type: 'jsonb' })
  details: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: FraudFlagStatus,
    default: FraudFlagStatus.OPEN,
  })
  status: FraudFlagStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
