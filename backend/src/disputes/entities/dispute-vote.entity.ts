import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { Dispute, DisputeResolution } from './dispute.entity';
import { User } from '../../users/entities/user.entity';

/**
 * A single reputation-weighted vote cast on a dispute tier. Voting is the
 * mechanism by which a tier reaches quorum and finalizes. Each vote snapshots
 * the voter's reputation as its {@link weight} at cast time so later reputation
 * changes cannot retroactively alter an already-tallied outcome.
 *
 * A voter (identified by wallet address) may vote at most once across the
 * whole escalation chain, enforced both at the application layer and by the
 * unique (dispute, address) index below combined with a chain-wide lookup.
 */
@Entity('dispute_votes')
@Index(['disputeId'])
@Index(['voterAddress'])
@Index(['disputeId', 'voterAddress'], { unique: true })
export class DisputeVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dispute_id' })
  @Index()
  disputeId: string;

  @Column({ name: 'voter_id' })
  voterId: string;

  /** Wallet address of the voter; the identity used for double-vote checks. */
  @Column({ name: 'voter_address' })
  @Index()
  voterAddress: string;

  @Column({ type: 'enum', enum: DisputeResolution })
  outcome: DisputeResolution;

  /** Reputation-derived weight of this vote, snapshotted at cast time. */
  @Column({ type: 'int', default: 0 })
  weight: number;

  /** Tier of the dispute at which this vote was cast. */
  @Column({ type: 'int', default: 1 })
  tier: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Dispute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id', referencedColumnName: 'id' })
  dispute: Dispute;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'voter_id', referencedColumnName: 'id' })
  voter: User;
}
