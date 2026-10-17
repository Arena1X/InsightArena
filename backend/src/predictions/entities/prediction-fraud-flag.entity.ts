import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  AfterLoad,
  AfterInsert,
  BeforeUpdate,
} from 'typeorm';
import { createHash } from 'crypto';
import { User } from '../../users/entities/user.entity';
import { Prediction } from './prediction.entity';
import { FraudEvidenceImmutableException } from '../exceptions/fraud-evidence-immutable.exception';

export enum FraudSignalType {
  TIMING_CLUSTERING = 'timing_clustering',
  COUNTERPARTY_CONCENTRATION = 'counterparty_concentration',
  POST_DEADLINE_EDIT = 'post_deadline_edit',
  DUPLICATE_BURST = 'duplicate_burst',
}

export enum FraudFlagStatus {
  OPEN = 'open',
  REVIEWED = 'reviewed',
  DISMISSED = 'dismissed',
}

/**
 * Advisory-only record of a suspicious prediction pattern. Created when a
 * computed signal (see PredictionsService.evaluateFraudSignalsForUser)
 * exceeds its configured threshold. Never drives automatic enforcement -
 * admins review and resolve flags manually.
 */
@Entity('prediction_fraud_flags')
@Index(['user_id'])
@Index(['signal_type'])
@Index(['status'])
@Index(['prediction_id', 'rule_id'], {
  unique: true,
  where: '"prediction_id" IS NOT NULL AND "rule_id" IS NOT NULL',
})
export class PredictionFraudFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: FraudSignalType })
  signal_type: FraudSignalType;

  @Column({ type: 'float' })
  score: number;

  @Column({ type: 'float' })
  threshold: number;

  @Column({ type: 'jsonb' })
  details: Record<string, unknown>;

  /**
   * Prediction that triggered a per-prediction rule (see
   * PredictionFraudRulesService). Null for user-level aggregate signals.
   */
  @Column({ type: 'uuid', nullable: true })
  prediction_id: string | null;

  @ManyToOne(() => Prediction, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'prediction_id' })
  prediction: Prediction | null;

  /** Identifier of the rule that raised this flag (e.g. post_deadline_edit). */
  @Column({ type: 'varchar', length: 50, nullable: true })
  rule_id: string | null;

  /**
   * Write-once snapshot of the state observed at detection time. Excluded
   * from UPDATE statements, guarded by the BeforeUpdate hook below and by a
   * database trigger, so it can never be changed after the flag is created.
   */
  @Column({ type: 'jsonb', nullable: true, update: false })
  evidence: Record<string, unknown> | null;

  /** SHA-256 of the canonical evidence JSON, for tamper detection. */
  @Column({ type: 'varchar', length: 64, nullable: true, update: false })
  evidence_hash: string | null;

  @Column({
    type: 'enum',
    enum: FraudFlagStatus,
    default: FraudFlagStatus.OPEN,
  })
  status: FraudFlagStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @AfterLoad()
  @AfterInsert()
  protected capturePersistedEvidence(): void {
    persistedEvidence.set(this, canonicalJson(this.evidence ?? null));
  }

  @BeforeUpdate()
  protected rejectEvidenceMutation(): void {
    const original = persistedEvidence.get(this);
    if (
      original !== undefined &&
      canonicalJson(this.evidence ?? null) !== original
    ) {
      throw new FraudEvidenceImmutableException(this.id);
    }
  }
}

/**
 * Canonical evidence captured when a flag was inserted or loaded. Kept
 * outside the entity so it never ends up in serialized API responses.
 */
const persistedEvidence = new WeakMap<PredictionFraudFlag, string>();

/**
 * Deterministic JSON serialization (object keys sorted recursively) so the
 * same evidence always yields the same string and hash regardless of key
 * order - Postgres jsonb does not preserve insertion order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function hashEvidence(evidence: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalJson(evidence)).digest('hex');
}
