import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ExportPredictionsDto {
  @ApiPropertyOptional({
    description: 'Start date for filtering (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering (ISO 8601)',
    example: '2026-07-28',
  })
  @IsOptional()
  @IsString()
  end_date?: string;
}
