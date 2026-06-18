import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('creator_events')
export class CreatorEvent {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  @ApiProperty()
  on_chain_event_id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  @ApiProperty()
  creator_address: string;

  @Column({ type: 'varchar', length: 200 })
  @ApiProperty()
  title: string;

  @Column({ type: 'text', nullable: true })
  @ApiPropertyOptional()
  description?: string;

  @Column({ type: 'boolean', default: true })
  @ApiProperty()
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty()
  is_cancelled: boolean;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  participant_count: number;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  match_count: number;

  @Column({ type: 'boolean', default: false })
  @ApiProperty()
  winners_verified: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiPropertyOptional()
  creation_fee_paid?: string;

  @Column({ type: 'timestamp', nullable: true })
  @ApiPropertyOptional()
  on_chain_created_at?: Date;

  @Column({ type: 'timestamptz' })
  @ApiProperty({ description: 'Campaign start time indexed from chain data' })
  start_time: Date;

  @Column({ type: 'timestamptz' })
  @ApiProperty({ description: 'Campaign end time indexed from chain data' })
  end_time: Date;

  @Column({ type: 'bigint', default: '0' })
  @ApiProperty({ description: 'Total campaign prize pool in stroops' })
  prize_pool: string;

  @Column({ type: 'integer', array: true, default: () => "'{}'::integer[]" })
  @ApiProperty({ type: [Number], description: 'Reward split percentages' })
  reward_distribution: number[];

  @Column({ type: 'bigint', default: '0' })
  @ApiProperty({ description: 'Entry fee in stroops' })
  entry_fee: string;

  @Column({ type: 'varchar', length: 100, default: 'general' })
  @ApiProperty({ description: 'Normalized campaign category slug' })
  category: string;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  @ApiPropertyOptional({ description: 'Optional campaign banner URL' })
  banner_url?: string | null;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether the campaign has been finalized' })
  is_finalized: boolean;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  max_participants: number;

  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;

  @UpdateDateColumn()
  @ApiProperty()
  updated_at: Date;
}
