import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from './match.entity';

/**
 * Immutable audit row recording a two-source result disagreement for a
 * match. Never mutated after creation except to mark it resolved once an
 * admin has reviewed it.
 */
@Entity('match_result_divergences')
@Index(['match'])
@Index(['resolved'])
export class MatchResultDivergence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column({ type: 'varchar', length: 100 })
  source_a_name: string;

  @Column({ type: 'jsonb' })
  source_a_value: Record<string, unknown>;

  @Column({ type: 'varchar', length: 100 })
  source_b_name: string;

  @Column({ type: 'jsonb' })
  source_b_value: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
