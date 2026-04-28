import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum CompetitionVisibility {
  Public = 'public',
  Private = 'private',
}

@Entity('competitions')
@Index('IDX_competitions_invite_code_unique_when_set', ['invite_code'], {
  unique: true,
  where: '"invite_code" IS NOT NULL',
})
export class Competition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'timestamptz' })
  start_time: Date;

  @Column({ type: 'timestamptz' })
  end_time: Date;

  @Column({ type: 'bigint', default: 0 })
  prize_pool_stroops: string;

  @Column({ default: 0 })
  max_participants: number;

  @Column({ default: 0 })
  participant_count: number;

  @Column({ default: false })
  is_finalized: boolean;

  @Column({ default: false })
  is_cancelled: boolean;

  @Index()
  @Column({
    type: 'enum',
    enum: CompetitionVisibility,
    default: CompetitionVisibility.Public,
  })
  visibility: CompetitionVisibility;

  @Column({ nullable: true })
  invite_code: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @Column({ type: 'uuid', nullable: true })
  creator_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
