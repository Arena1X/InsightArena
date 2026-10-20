import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity()
export class MarketInviteCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  market_id: string;

  @Index({ unique: true })
  @Column()
  code: string;

  @Column({ type: 'int' })
  max_uses: number;

  @Column({ type: 'int' })
  current_uses: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @CreateDateColumn()
  created_at: Date;
}
