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
@Index(['user'])
@Index(['market'])
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

  @CreateDateColumn()
  submitted_at: Date;
}
