import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Market } from '../../markets/entities/market.entity';

@Entity('predictions')
@Unique('UQ_prediction_user_market', ['user', 'market'])
@Unique('UQ_prediction_client_idempotency_key', ['clientIdempotencyKey'])
@Index(['user'])
@Index(['market'])
@Index(['submitted_at'])
@Index(['payout_claimed', 'submitted_at'])
@Index(['clientIdempotencyKey'])
@Index(['device_fingerprint', 'submitted_at'])
export class Prediction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Market, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'marketId' })
  market: Market;

  @Column()
  chosen_outcome: string;

  @Column({ type: 'bigint' })
  stake_amount_stroops: string;

  @Column({ default: false })
  payout_claimed: boolean;

  @Column({ type: 'bigint', default: '0' })
  payout_amount_stroops: string;

  @Column({ nullable: true })
  tx_hash: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid' })
  clientIdempotencyKey: string;

  /**
   * Optional client device fingerprint (X-Device-Fingerprint header) captured
   * at submission time; used by the duplicate-burst fraud rule.
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  device_fingerprint: string | null;

  @CreateDateColumn()
  submitted_at: Date;
}
