import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { WebhookEndpoint } from './webhook-endpoint.entity';

export enum DeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

@Entity('webhook_delivery_logs')
@Index(['endpoint'])
@Index(['status'])
@Index(['event_type'])
@Index(['endpoint', 'status'])
@Index(['created_at'])
@Index(['endpoint', 'created_at'])
export class WebhookDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => WebhookEndpoint, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'endpoint_id' })
  endpoint: WebhookEndpoint;

  @Column({ type: 'varchar' })
  event_type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'varchar',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status: DeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempt_count: number;

  @Column({ type: 'int', nullable: true })
  http_status_code: number | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  next_retry_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  delivered_at: Date | null;
}
