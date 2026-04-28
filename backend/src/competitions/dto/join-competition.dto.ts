import { ApiProperty } from '@nestjs/swagger';

export class JoinCompetitionResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  competition_id: string;

  @ApiProperty()
  participant_id: string;
}
