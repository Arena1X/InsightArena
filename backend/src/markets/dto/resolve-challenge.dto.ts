import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ResolveChallengeDto {
  @ApiProperty({
    description: 'Final winning outcome decided by admin review',
    example: 'NO',
  })
  @IsString()
  @IsNotEmpty()
  outcome: string;
}
