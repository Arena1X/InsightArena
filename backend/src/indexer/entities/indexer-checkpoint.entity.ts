import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('indexer_checkpoints')
export class IndexerCheckpoint {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'bigint' })
  value: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  meta: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
