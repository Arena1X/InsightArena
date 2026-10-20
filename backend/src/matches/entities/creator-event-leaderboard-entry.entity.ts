import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('creator_event_leaderboard_entries')
@Index(['event_id', 'user_address'], { unique: true })
@Index(['event_id', 'rank'])
export class CreatorEventLeaderboardEntry {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  @ApiProperty()
  event_id: string;

  @Column({ type: 'varchar', length: 255 })
  @ApiProperty()
  user_address: string;

  @Column({ type: 'int' })
  @ApiProperty()
  rank: number;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  total_predictions: number;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  correct_predictions: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  @ApiProperty()
  accuracy_percentage: number;

  @Column({ type: 'boolean', default: false })
  @ApiProperty()
  is_winner: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  @ApiProperty({ nullable: true })
  completion_time: Date | null;

  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;
}
