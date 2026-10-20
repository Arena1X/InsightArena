import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/entities/user.entity';

@Entity('user_flags')
@Index(['user_id'])
export class UserFlag {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @ApiProperty({ required: false })
  reason: string | null;

  @Column({ type: 'varchar' })
  @ApiProperty()
  flagged_by: string;

  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;
}
