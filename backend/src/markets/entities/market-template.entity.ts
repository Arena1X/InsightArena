import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { IsString, IsNumber, Min } from 'class-validator';

@Entity('market_templates')
export class MarketTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column()
  @IsNumber()
  @Min(1)
  suggested_duration_days: number;

  @CreateDateColumn()
  created_at: Date;
}
