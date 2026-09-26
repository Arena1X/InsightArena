import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsString()
  end_date?: string;
}

export function validateDateRange(
  startDate?: string,
  endDate?: string,
): { start?: Date; end?: Date } {
  const start = startDate ? new Date(startDate) : undefined;
  const end = endDate ? new Date(endDate) : undefined;

  if (start && isNaN(start.getTime())) {
    throw new Error('Invalid start date');
  }
  if (end && isNaN(end.getTime())) {
    throw new Error('Invalid end date');
  }
  if (start && end && start.getTime() > end.getTime()) {
    throw new Error('Start date must not be after end date');
  }

  return { start, end };
}
