import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('creator_event_winners')
@Index(['event_id', 'user_address'], { unique: true })
@Index(['event_id'])
export class CreatorEventWinner {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column()
  @Index()
  @ApiProperty()
  event_id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  @ApiProperty()
  user_address: string;

  @Column({ type: 'int' })
  @ApiProperty()
  total_correct: number;

  @Column({ type: 'int' })
  @ApiProperty()
  total_matches: number;

  @Column({ type: 'timestamptz' })
  @ApiProperty()
  completion_time: Date;

  @Column({ type: 'timestamptz' })
  @ApiProperty()
  verified_at: Date;

  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;
}
