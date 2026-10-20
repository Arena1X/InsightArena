import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CompetitionBracket } from './competition-bracket.entity';

@Entity('bracket_rounds')
@Index(['bracket_id', 'round_number'], { unique: true })
export class BracketRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bracket_id: string;

  @ManyToOne(() => CompetitionBracket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bracket_id' })
  bracket: CompetitionBracket;

  @Column({ type: 'int' })
  round_number: number;

  @Column({ type: 'varchar' })
  name: string;
}
