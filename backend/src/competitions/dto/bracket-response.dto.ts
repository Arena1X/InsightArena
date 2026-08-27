import { ApiProperty } from '@nestjs/swagger';
import { BracketStatus } from '../entities/competition-bracket.entity';

export class BracketMatchupResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  match_number: number;

  @ApiProperty({ nullable: true })
  participant_1_id: string | null;

  @ApiProperty({ nullable: true })
  participant_2_id: string | null;

  @ApiProperty({ nullable: true })
  winner_id: string | null;

  @ApiProperty()
  is_bye: boolean;
}

export class BracketRoundResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  round_number: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [BracketMatchupResponseDto] })
  matchups: BracketMatchupResponseDto[];
}

export class BracketResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  competition_id: string;

  @ApiProperty()
  total_rounds: number;

  @ApiProperty({ enum: BracketStatus })
  status: BracketStatus;

  @ApiProperty()
  generated_at: Date;

  @ApiProperty({ type: [BracketRoundResponseDto] })
  rounds: BracketRoundResponseDto[];
}
