import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../users/entities/user.entity';

@Entity('seasons')
@Index(['is_active'])
@Index(['starts_at', 'ends_at'])
export class Season {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 3 })
  @Column({ type: 'int', unique: true })
  season_number: number;

  @ApiProperty({ example: 'Season 3' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty()
  @Column({ type: 'timestamp' })
  starts_at: Date;

  @ApiProperty()
  @Column({ type: 'timestamp' })
  ends_at: Date;

  @ApiProperty({ example: '50000000' })
  @Column({ type: 'bigint', default: '0' })
  reward_pool_stroops: string;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  is_active: boolean;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  is_finalized: boolean;

  @ApiProperty({ example: 0 })
  @Column({ type: 'int', default: 0 })
  participant_count: number;

  @ApiPropertyOptional({
    description: 'Set when the season is finalized; joined for list responses',
  })
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'top_winner_user_id' })
  top_winner: User | null;

  @ApiPropertyOptional()
  @Column({ type: 'int', nullable: true })
  on_chain_season_id: number | null;

  @ApiPropertyOptional()
  @Column({ type: 'varchar', length: 128, nullable: true })
  soroban_tx_hash: string | null;

  @CreateDateColumn()
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updated_at: Date;
}
