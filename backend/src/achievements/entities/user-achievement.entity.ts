import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Achievement } from './achievement.entity';

@Entity('user_achievements')
@Unique('UQ_user_achievement', ['user', 'achievement'])
@Index(['user'])
@Index(['achievement'])
export class UserAchievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  achievementId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Achievement, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'achievementId' })
  achievement: Achievement;

  @Column({ default: false })
  is_unlocked: boolean;

  @Column({ default: 0 })
  current_value: number;

  @CreateDateColumn({ nullable: true })
  unlocked_at: Date | null;
}
