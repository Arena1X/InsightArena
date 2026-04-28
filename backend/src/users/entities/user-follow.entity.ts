import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_follows')
@Unique(['follower_id', 'following_id'])
@Index(['follower_id'])
@Index(['following_id'])
export class UserFollow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  follower_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  follower: User;

  @Column()
  following_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  following: User;

  @CreateDateColumn()
  created_at: Date;
}
