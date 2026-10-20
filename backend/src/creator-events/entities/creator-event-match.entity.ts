import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('creator_event_matches')
@Index(['event_id', 'on_chain_match_id'], { unique: true })
export class CreatorEventMatch {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  @ApiProperty()
  on_chain_match_id: string;

  @Column()
  @Index()
  @ApiProperty()
  event_id: string;

  @Column({ type: 'varchar', length: 100 })
  @ApiProperty()
  team_a: string;

  @Column({ type: 'varchar', length: 100 })
  @ApiProperty()
  team_b: string;

  @Column({ type: 'timestamptz' })
  @Index()
  @ApiProperty()
  match_time: Date;

  @Column({ type: 'boolean', default: false })
  @ApiProperty()
  result_submitted: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  @ApiPropertyOptional()
  winning_team?: string;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  prediction_count: number;

  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;
}
