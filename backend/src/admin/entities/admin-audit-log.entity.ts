import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('admin_audit_logs')
@Index(['actor_id'])
@Index(['action'])
@Index(['created_at'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  /** ID of the admin who performed the action. */
  @Column({ type: 'varchar', length: 255 })
  @ApiProperty()
  actor_id: string;

  /** Human-readable action name, e.g. BAN_USER, RESOLVE_MARKET. */
  @Column({ type: 'varchar', length: 100 })
  @ApiProperty()
  action: string;

  /** Type of the target resource, e.g. "user", "market". */
  @Column({ type: 'varchar', length: 100, nullable: true })
  @ApiPropertyOptional()
  target_type: string | null;

  /** ID of the target resource. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiPropertyOptional()
  target_id: string | null;

  /** Arbitrary JSON metadata captured at the time of the action. */
  @Column({ type: 'jsonb', nullable: true })
  @ApiPropertyOptional()
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty()
  created_at: Date;
}
