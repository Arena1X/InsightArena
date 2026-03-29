import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { IsString, IsOptional, IsNumber, Min, IsIn } from 'class-validator';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  @IsString()
  stellar_address: string;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  username: string | null;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  avatar_url: string | null;

  @Column({ default: 0 })
  @IsNumber()
  @Min(0)
  total_predictions: number;

  @Column({ default: 0 })
  @IsNumber()
  @Min(0)
  correct_predictions: number;

  @Column({ type: 'bigint', default: 0 })
  @IsString()
  total_staked_stroops: string;

  @Column({ type: 'bigint', default: 0 })
  @IsString()
  total_winnings_stroops: string;

  @Column({ default: 0 })
  @IsNumber()
  reputation_score: number;

  @Column({ default: 0 })
  @IsNumber()
  season_points: number;

  @Column({ default: 'user' })
  @IsString()
  @IsIn(['user', 'admin'])
  role: string;

  @Column({ default: false })
  is_banned: boolean;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  ban_reason: string | null;

  @Column({ nullable: true })
  @IsOptional()
  banned_at: Date | null;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  banned_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
