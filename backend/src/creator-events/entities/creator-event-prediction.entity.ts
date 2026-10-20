import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('creator_event_predictions')
@Unique(['event_id', 'match_id', 'user_address'])
@Index(['event_id'])
@Index(['match_id'])
export class CreatorEventPrediction {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column()
  @Index()
  @ApiProperty()
  event_id: string;

  @Column()
  @Index()
  @ApiProperty()
  match_id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  @ApiProperty()
  user_address: string;

  @Column({ type: 'varchar', length: 50 })
  @ApiProperty()
  predicted_outcome: string;

  @Column({ type: 'boolean', nullable: true })
  @ApiPropertyOptional()
  is_correct?: boolean;

  @CreateDateColumn()
  @ApiProperty()
  predicted_at: Date;
}
