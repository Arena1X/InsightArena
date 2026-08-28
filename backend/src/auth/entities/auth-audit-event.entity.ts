import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Security-relevant auth events: login, refresh token rotation, session
 * revocation (logout), and refresh token reuse detection — both successes
 * and failures. `metadata` always carries `outcome` ('success' | 'failure')
 * and `ip` so the audit trail is queryable without parsing `event_type`.
 */
@Entity('auth_audit_events')
export class AuthAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nullable because in principle the user might not be resolvable. */
  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  user_id: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Index()
  @Column({ name: 'family_id', type: 'uuid', nullable: true })
  family_id: string | null;

  /** One of the `AuthAuditEventType` values, e.g. 'login_success'. */
  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  event_type: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
