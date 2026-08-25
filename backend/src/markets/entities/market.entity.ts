import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Grace-period settlement state machine, independent of the legacy
 * `is_resolved` flag used by the immediate admin-override resolution path.
 * PENDING -> PROPOSED -> SETTLING -> SETTLED, with PROPOSED -> CHALLENGED ->
 * SETTLED when a challenge is raised during the grace window. SETTLING is a
 * short-lived, crash-visible marker: MarketSettlementScheduler moves a
 * market here once it has claimed it (advisory lock + settlement-attempt
 * row) and before the on-chain call resolves, so a crash between those two
 * steps leaves a durable trace instead of silently losing the market
 * between PROPOSED and SETTLED.
 */
export enum MarketSettlementState {
  PENDING = 'pending',
  PROPOSED = 'proposed',
  SETTLING = 'settling',
  CHALLENGED = 'challenged',
  SETTLED = 'settled',
}

@Entity('markets')
@Index(['on_chain_market_id'])
@Index(['creator'])
@Index(['category'])
@Index(['is_resolved'])
@Index(['is_featured'])
@Index(['settlement_state'])
export class Market {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @IsString()
  on_chain_market_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @IsOptional()
  creator: User;

  @Column()
  @IsString()
  title: string;

  @Column('text')
  @IsString()
  description: string;

  @Column()
  @IsString()
  category: string;

  @Column('simple-array')
  outcome_options: string[];

  @Column({ type: 'timestamptz' })
  end_time: Date;

  @Column({ type: 'timestamptz' })
  resolution_time: Date;

  @Column({ default: false })
  @IsBoolean()
  is_resolved: boolean;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  resolved_outcome: string;

  @Column({ type: 'timestamptz', nullable: true })
  @IsOptional()
  resolved_at: Date | null;

  @Column({
    type: 'enum',
    enum: MarketSettlementState,
    enumName: 'market_settlement_state',
    default: MarketSettlementState.PENDING,
  })
  @IsEnum(MarketSettlementState)
  settlement_state: MarketSettlementState;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  proposed_outcome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  @IsOptional()
  resolution_proposed_at: Date | null;

  @Column({ type: 'int', default: 86400 })
  @IsNumber()
  @Min(0)
  grace_period_seconds: number;

  @Column({ default: true })
  @IsBoolean()
  is_public: boolean;

  @Column({ default: false })
  @IsBoolean()
  is_cancelled: boolean;

  @Column({ default: false })
  @IsBoolean()
  is_featured: boolean;

  @Column({ default: false })
  @IsBoolean()
  is_paused: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  @IsOptional()
  featured_at: Date | null;

  @Column({ type: 'bigint', default: '0' })
  @IsString()
  total_pool_stroops: string;

  @Column({ default: 0 })
  @IsNumber()
  @Min(0)
  participant_count: number;

  @CreateDateColumn()
  created_at: Date;
}
