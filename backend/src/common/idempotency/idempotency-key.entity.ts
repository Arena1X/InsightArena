import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('idempotency_keys')
@Index(['key', 'userId'], { unique: true })
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** sha256 of method+path+body — detects same-key/different-body reuse */
  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  request_hash: string;

  /** Null while the original request is still executing */
  @Column({ name: 'status_code', type: 'int', nullable: true })
  status_code: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  response_body: unknown;

  @Column({ name: 'in_progress', type: 'boolean', default: true })
  in_progress: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
