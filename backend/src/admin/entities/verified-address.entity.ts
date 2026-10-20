import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('verified_addresses')
@Index(['address'], { unique: true })
export class VerifiedAddress {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @ApiProperty()
  address: string;

  @Column({ type: 'varchar', length: 255 })
  @ApiProperty()
  verified_by: string;

  @Column({ type: 'int', default: 0 })
  @ApiProperty()
  events_created: number;

  @CreateDateColumn()
  @ApiProperty()
  verified_at: Date;
}
