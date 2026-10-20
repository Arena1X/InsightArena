import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChallengeResolutionDto {
  @ApiProperty({
    description: 'Reason for challenging the proposed resolution',
    example: 'Outcome contradicts publicly available results.',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
