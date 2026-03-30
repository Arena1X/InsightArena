import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Market } from '../../markets/entities/market.entity';

@Entity('market_history')
@Index(['market', 'recorded_at'])
@Index(['market'])
export class MarketHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Market, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'marketId' })
  market: Market;

  @Column({ type: 'timestamptz' })
  recorded_at: Date;

  @Column({ default: 0 })
  prediction_volume: number;

  @Column({ type: 'bigint', default: '0' })
  pool_size_stroops: string;

  @Column({ default: 0 })
  participant_count: number;

  @Column('simple-array', { nullable: true })
  outcome_probabilities: string[];

  @CreateDateColumn()
  created_at: Date;
}
