import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { Market } from '../../markets/entities/market.entity';
import { User } from '../../users/entities/user.entity';

export enum DisputeStatus {
  PENDING = 'pending',
  RESOLVED = 'resolved',
}

export enum DisputeResolution {
  UPHELD = 'upheld',
  OVERTURNED = 'overturned',
}

@Entity('disputes')
@Index(['marketId'])
@Index(['disputantId'])
@Index(['status'])
@Index(['resolvedById'])
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'market_id' })
  @Index()
  marketId: string;

  @Column({ name: 'disputant_id' })
  @Index()
  disputantId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.PENDING,
  })
  @Index()
  status: DisputeStatus;

  @Column({
    type: 'enum',
    enum: DisputeResolution,
    nullable: true,
  })
  resolution: DisputeResolution | null;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ name: 'resolved_by_id', nullable: true })
  @Index()
  resolvedById: string | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({
    name: 'on_chain_dispute_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  onChainDisputeId: string | null;

  @Column({
    name: 'on_chain_resolution_tx',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  onChainResolutionTx: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relationships
  @ManyToOne(() => Market, { eager: true })
  @JoinColumn({ name: 'market_id', referencedColumnName: 'id' })
  market: Market;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'disputant_id', referencedColumnName: 'id' })
  disputant: User;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'resolved_by_id', referencedColumnName: 'id' })
  resolvedBy: User | null;
}
