import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Match } from './match.entity';

@Entity('creator_events')
@Index(['on_chain_event_id'], { unique: true })
@Index(['creator_address'])
@Index(['is_active'])
@Index(['is_active', 'is_cancelled', 'created_at'])
@Index(['creator_address', 'created_at'])
@Index(['participant_count'])
@Index(['match_count'])
@Index('IDX_creator_events_category', ['category'])
@Index('IDX_creator_events_campaign_window', [
  'is_active',
  'is_cancelled',
  'start_time',
  'end_time',
])
@Index(['is_finalized'])
@Index(['end_time'])
export class CreatorEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint' })
  on_chain_event_id: number;

  @Column({ type: 'varchar', length: 255 })
  creator_address: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'bigint', default: '0' })
  creation_fee_paid: string;

  @Column({ type: 'timestamptz' })
  on_chain_created_at: Date;

  @Column({ type: 'timestamptz' })
  start_time: Date;

  @Column({ type: 'timestamptz' })
  end_time: Date;

  @Column({ type: 'bigint', default: '0' })
  prize_pool: string;

  @Column({ type: 'integer', array: true, default: () => "'{}'::integer[]" })
  reward_distribution: number[];

  @Column({ type: 'bigint', default: '0' })
  entry_fee: string;

  @Column({ type: 'bigint', default: '0' })
  total_entry_fees_collected: string;

  @Column({ type: 'varchar', length: 100, default: 'general' })
  category: string;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  banner_url: string | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: false })
  is_cancelled: boolean;

  @Column({ type: 'varchar', length: 8, nullable: true })
  invite_code: string | null;

  @Column({ default: 0 })
  max_participants: number;

  @Column({ default: 0 })
  participant_count: number;

  @Column({ default: 0 })
  match_count: number;

  @Column({ default: false })
  is_finalized: boolean;

  @OneToMany(() => Match, (match) => match.event)
  matches: Match[];

  @CreateDateColumn()
  created_at: Date;
}
