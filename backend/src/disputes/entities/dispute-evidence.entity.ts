import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { Dispute } from './dispute.entity';
import { User } from '../../users/entities/user.entity';

@Entity('dispute_evidence')
@Index(['disputeId'])
@Index(['uploadedById'])
export class DisputeEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dispute_id' })
  disputeId: string;

  @Column({ name: 'uploaded_by_id' })
  uploadedById: string;

  @Column({ name: 'file_url', type: 'varchar', length: 2048 })
  fileUrl: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relationships
  @ManyToOne(() => Dispute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id', referencedColumnName: 'id' })
  dispute: Dispute;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_id', referencedColumnName: 'id' })
  uploadedBy: User;
}
