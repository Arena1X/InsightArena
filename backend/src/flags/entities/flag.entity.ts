import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Market } from '../../markets/entities/market.entity';
import { User } from '../../users/entities/user.entity';

export enum FlagStatus {
  PENDING = 'pending',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum FlagReason {
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  SPAM = 'spam',
  MISINFORMATION = 'misinformation',
  HARASSMENT = 'harassment',
  HATE_SPEECH = 'hate_speech',
  VIOLENCE = 'violence',
  COPYRIGHT = 'copyright',
  OTHER = 'other',
}

export enum FlagResolutionAction {
  DISMISS = 'dismiss',
  REMOVE_MARKET = 'remove_market',
  BAN_USER = 'ban_user',
}

@Entity('flags')
@Index(['market'])
@Index(['user'])
@Index(['status'])
@Index(['reason'])
export class Flag {
  @PrimaryGeneratedColumn('uuid')
  @IsUUID()
  id: string;

  @ManyToOne(() => Market, { onDelete: 'CASCADE' })
  market: Market;

  @Column()
  @IsUUID()
  market_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  @IsUUID()
  user_id: string;

  @Column({
    type: 'enum',
    enum: FlagReason,
  })
  @IsEnum(FlagReason)
  reason: FlagReason;

  @Column({
    type: 'enum',
    enum: FlagStatus,
    default: FlagStatus.PENDING,
  })
  @IsEnum(FlagStatus)
  status: FlagStatus;

  @Column('text', { nullable: true })
  @IsOptional()
  @IsString()
  description: string | null;

  @Column({
    type: 'enum',
    enum: FlagResolutionAction,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(FlagResolutionAction)
  resolution_action: FlagResolutionAction | null;

  @Column('text', { nullable: true })
  @IsOptional()
  @IsString()
  admin_notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  resolved_by: string | null;

  @ManyToOne(() => User, { nullable: true })
  resolved_by_user: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  @IsOptional()
  resolved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
