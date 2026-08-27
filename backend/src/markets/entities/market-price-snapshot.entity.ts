import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Market } from './market.entity';

@Entity('market_price_snapshots')
@Index(['market_id', 'outcome_index', 'created_at'])
export class MarketPriceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  market_id: string;

  @ManyToOne(() => Market, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'market_id' })
  market: Market;

  @Column({ type: 'int' })
  outcome_index: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  price: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
