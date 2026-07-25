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
 * Represents a single issued refresh token in a rotation chain.
 *
 * Rotation model: every successful `rotateRefreshToken()` call revokes the
 * presented token and mints a brand new row in the same `family_id`. The
 * `family_id` stays constant for the lifetime of a login session and only
 * changes on a fresh login (new family). If a `revoked_at` token is ever
 * presented again, that's proof of token theft/replay — the whole family is
 * revoked (see AuthService.rotateRefreshToken).
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Groups the entire rotation chain from one login. Constant across rotations. */
  @Index()
  @Column({ name: 'family_id', type: 'uuid' })
  family_id: string;

  /**
   * sha256(rawToken) hex digest — used for fast equality lookup by hash.
   * Deliberately NOT bcrypt: refresh tokens are already high-entropy random
   * values (unlike user-chosen passwords), and rotation needs an indexed
   * equality lookup, not a slow per-candidate password-style comparison.
   */
  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  token_hash: string;

  /**
   * Id of the token this row replaced (rotation lineage), forming a backward
   * chain within the family. Kept as a plain nullable uuid column with an
   * index rather than a self-referencing foreign key, to avoid the awkward
   * migration ordering a self-FK on the same table introduces; lineage here
   * is used for audit/debugging only, not to enforce referential integrity.
   */
  @Index()
  @Column({ name: 'previous_token_id', type: 'uuid', nullable: true })
  previous_token_id: string | null;

  /**
   * Set once this token has been rotated away (consumed) OR force-revoked
   * because reuse was detected elsewhere in its family. Non-null == unusable.
   */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expires_at: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
