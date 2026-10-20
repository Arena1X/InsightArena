import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('webhook_endpoints')
@Index(['user'])
@Index(['user', 'is_active'])
@Index(['event_types'])
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'simple-array' })
  event_types: string[];

  @Column({ type: 'varchar', length: 64 })
  secret_key: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'int', default: 0 })
  failure_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_delivery_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_failure_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
