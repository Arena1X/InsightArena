import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('webhook_processed_events')
@Index('IDX_webhook_processed_events_source_event_id', ['source', 'event_id'], {
  unique: true,
})
export class WebhookProcessedEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  source: string;

  @Column({ type: 'varchar', length: 255 })
  event_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  received_at: Date;
}
