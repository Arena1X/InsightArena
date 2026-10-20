import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CreatorEventLeaderboardEntry } from './creator-event-leaderboard-entry.entity';

/**
 * Persists the per-user prize payout emitted by the contract's EventFinalized event.
 * One row per participant per event. Keyed by (event_id, user_address) so the
 * payouts API can resolve a single address in O(log n) without a full scan.
 *
 * event_id stores the string representation of the on-chain event ID, matching
 * the convention already used in CreatorEventLeaderboardEntry.
 */
@Entity('creator_event_payouts')
@Index('UQ_cep_event_address', ['event_id', 'user_address'], { unique: true })
@Index('IDX_cep_event_id', ['event_id'])
export class CreatorEventPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  event_id: string;

  @Column({ type: 'varchar', length: 255 })
  user_address: string;

  /** Prize amount in stroops (1 XLM = 10_000_000 stroops). Stored as bigint string. */
  @Column({ type: 'bigint', default: '0' })
  payout_amount_stroops: string;

  /**
   * Flipped to true by the PayoutClaimed handler (future work).
   * Included now so the entity schema is stable and the frontend can
   * distinguish claimable vs already-claimed payouts.
   */
  @Column({ default: false })
  is_claimed: boolean;

  @Column({ type: 'uuid' })
  leaderboard_entry_id: string;

  @ManyToOne(() => CreatorEventLeaderboardEntry, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'leaderboard_entry_id' })
  leaderboard_entry: CreatorEventLeaderboardEntry;

  @CreateDateColumn()
  created_at: Date;
}
