import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RotateApiKeyDto {
  @ApiPropertyOptional({
    example: 86_400_000,
    description:
      'Grace window (ms) the old key remains valid for after rotation; defaults to 24 hours',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  grace_period_ms?: number;
}
