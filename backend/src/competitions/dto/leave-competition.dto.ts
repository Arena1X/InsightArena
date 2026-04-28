import { ApiProperty } from '@nestjs/swagger';

export class LeaveCompetitionResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  competition_id: string;
}
