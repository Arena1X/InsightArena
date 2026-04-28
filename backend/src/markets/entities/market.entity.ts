import {
  IsBoolean,
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

@Entity('markets')
@Index(['on_chain_market_id'])
@Index(['creator'])
@Index(['category'])
@Index(['is_resolved'])
@Index(['is_featured'])
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

  @Column({ default: true })
  @IsBoolean()
  is_public: boolean;

  @Column({ default: false })
  @IsBoolean()
  is_cancelled: boolean;

  @Column({ default: false })
  @IsBoolean()
  is_featured: boolean;

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
