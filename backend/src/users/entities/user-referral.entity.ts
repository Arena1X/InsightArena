import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

export enum ReferralStatus {
  PENDING = 'pending',
  QUALIFIED = 'qualified',
}

/**
 * A referrer -> referred relationship. `referred_id` is unique so a user
 * can only ever be attributed to a single referrer (no duplicate/competing
 * attribution). Status starts PENDING and moves to QUALIFIED once the
 * referred user completes a qualifying action (see
 * UsersService.recordQualifyingAction).
 */
@Entity('user_referrals')
@Unique('UQ_user_referrals_referred', ['referred_id'])
@Index(['referrer_id'])
@Index(['status'])
export class UserReferral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  referrer_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrer_id' })
  referrer: User;

  @Column({ type: 'uuid' })
  referred_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referred_id' })
  referred: User;

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column({ type: 'timestamptz', nullable: true })
  qualified_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
