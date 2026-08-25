import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeStatus } from '../entities/dispute.entity';

/**
 * Query DTO for the GET /disputes list endpoint.
 * Cursor pagination (opaque `ledger`-style cursor over id+created_at) with a
 * hard cap on page size, plus status/date-range filters.
 */
export class ListDisputesDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor from a previous page\'s next_cursor',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Results per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must not be less than 1' })
  @Max(100, { message: 'limit must not be greater than 100' })
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by dispute status',
    enum: DisputeStatus,
  })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @ApiPropertyOptional({
    description: 'Only include disputes created on/after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  created_after?: string;

  @ApiPropertyOptional({
    description: 'Only include disputes created on/before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  created_before?: string;
}

export interface DisputeStatusCounts {
  pending: number;
  resolved: number;
}

export interface PaginatedDisputesResponse {
  disputes: import('../entities/dispute.entity').Dispute[];
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
  counts_by_status: DisputeStatusCounts;
}
