import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('system_config')
export class SystemConfig {
  @PrimaryColumn()
  key: string;

  @Column('jsonb')
  value: unknown;

  @UpdateDateColumn()
  updated_at: Date;
}
