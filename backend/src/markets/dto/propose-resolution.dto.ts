import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ProposeResolutionDto {
  @ApiProperty({
    description: 'Proposed winning outcome, subject to the challenge window',
    example: 'YES',
  })
  @IsString()
  @IsNotEmpty()
  outcome: string;

  @ApiPropertyOptional({
    description:
      'Override the market default grace period for this proposal, in seconds',
    example: 86400,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  grace_period_seconds?: number;
}
