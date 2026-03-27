import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('system_state')
export class SystemState {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn()
  updated_at: Date;
}
