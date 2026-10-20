import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BracketRound } from './bracket-round.entity';
import { CompetitionParticipant } from './competition-participant.entity';

@Entity('bracket_matchups')
@Index(['round_id', 'match_number'], { unique: true })
export class BracketMatchup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  round_id: string;

  @ManyToOne(() => BracketRound, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'round_id' })
  round: BracketRound;

  @Column({ type: 'int' })
  match_number: number;

  @Column({ type: 'uuid', nullable: true })
  participant_1_id: string | null;

  @ManyToOne(() => CompetitionParticipant, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'participant_1_id' })
  participant_1: CompetitionParticipant;

  @Column({ type: 'uuid', nullable: true })
  participant_2_id: string | null;

  @ManyToOne(() => CompetitionParticipant, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'participant_2_id' })
  participant_2: CompetitionParticipant;

  @Column({ type: 'uuid', nullable: true })
  winner_id: string | null;

  @ManyToOne(() => CompetitionParticipant, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'winner_id' })
  winner: CompetitionParticipant;

  @Column({ type: 'boolean', default: false })
  is_bye: boolean;
}
