import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum FlagTargetType {
  USER_LIST = 'user_list',
  PERCENTAGE = 'percentage',
  ATTRIBUTE = 'attribute',
}

export enum FlagAttributeOperator {
  EQ = 'eq',
  NEQ = 'neq',
  GT = 'gt',
  GTE = 'gte',
  LT = 'lt',
  LTE = 'lte',
  IN = 'in',
  NOT_IN = 'not_in',
  CONTAINS = 'contains',
}

@Entity('feature_flags')
@Index(['key'], { unique: true })
@Index(['is_enabled'])
export class FeatureFlag {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ unique: true })
  @ApiProperty({ description: 'Unique flag key identifier' })
  key: string;

  @Column()
  @ApiProperty({ description: 'Human-readable flag name' })
  name: string;

  @Column('text', { nullable: true })
  @ApiProperty({ description: 'Flag description' })
  description: string | null;

  @Column({ default: false })
  @ApiProperty({ description: 'Global enable/disable' })
  is_enabled: boolean;

  @Column({
    type: 'enum',
    enum: FlagTargetType,
    nullable: true,
  })
  @ApiProperty({
    enum: FlagTargetType,
    nullable: true,
    description: 'Type of targeting rule',
  })
  targeting_type: FlagTargetType | null;

  @Column('jsonb', { nullable: true })
  @ApiProperty({
    description: 'Targeting rules configuration',
    example: {
      user_ids: ['uuid1', 'uuid2'],
      percentage: 25,
      attributes: { role: { operator: 'eq', value: 'admin' } },
    },
  })
  targeting_rules: Record<string, unknown> | null;

  @Column({ default: 0 })
  @ApiProperty({ description: 'Percentage of users to enable for (0-100)' })
  rollout_percentage: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
