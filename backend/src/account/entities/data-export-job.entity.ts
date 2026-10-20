import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ExportStatus = 'pending' | 'processing' | 'ready' | 'failed';

@Entity('data_export_jobs')
@Index(['user_id'])
@Index(['expires_at'])
export class DataExportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: ExportStatus;

  @Column({ type: 'varchar', nullable: true })
  file_path: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
