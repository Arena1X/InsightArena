import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EscalateDisputeDto {
  @ApiProperty({
    description: 'Target tier to escalate to (must be immediate next tier)',
    example: 2,
    required: false,
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(3)
  target_tier?: number;
}
