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

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Human-readable label set by the owner */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** First 8 chars of the raw key — safe to display, not secret */
  @Index()
  @Column({ name: 'key_prefix', type: 'varchar', length: 12 })
  key_prefix: string;

  /** bcrypt hash of the full raw key — never exposed via API */
  @Column({ name: 'key_hash', type: 'varchar' })
  key_hash: string;

  /**
   * Scopes this key is authorised to access.
   * Stored as a Postgres text[] column.
   * Example values: 'predictions:read', 'markets:read', 'webhooks:write'
   */
  @Column({ type: 'text', array: true, default: () => "'{}'::text[]" })
  scopes: string[];

  /** Optional expiry date — null means the key never expires */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expires_at: Date | null;

  /**
   * Set when the owner explicitly revokes the key.
   * A non-null value means the key is revoked.
   */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  /**
   * Throttled write — updated at most once every 60 s per guard request.
   * Avoids a DB write on every single authenticated request.
   */
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  last_used_at: Date | null;

  /**
   * Set when this key is rotated out via `ApiKeyService.rotate`. A non-null
   * value means a replacement key exists; this key keeps working only until
   * `grace_expires_at`.
   */
  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotated_at: Date | null;

  /**
   * End of the grace window during which a rotated-out key still validates,
   * so in-flight integrations have time to switch to the replacement key.
   * Null unless `rotated_at` is set.
   */
  @Column({ name: 'grace_expires_at', type: 'timestamptz', nullable: true })
  grace_expires_at: Date | null;

  /**
   * The key that replaced this one via rotation. Null unless `rotated_at` is
   * set. Plain indexed uuid rather than a FK — mirrors
   * `RefreshToken.previous_token_id`, avoiding self-referential FK ordering
   * issues on delete.
   */
  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replaced_by_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  /** Convenience getter: true when the key is currently usable */
  get isActive(): boolean {
    if (this.revoked_at) return false;
    if (this.expires_at && this.expires_at < new Date()) return false;
    if (
      this.rotated_at &&
      (!this.grace_expires_at || this.grace_expires_at < new Date())
    ) {
      return false;
    }
    return true;
  }
}
