import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Shared pagination query DTO used by list endpoints.
 *
 * Behaviour on invalid input:
 * - Out-of-range or non-integer values are **rejected** with HTTP 400.
 * - Values are NOT silently clamped. This makes client bugs immediately
 *   visible rather than masking them with quietly-modified results.
 *
 * Valid ranges:
 * - `page` : integer ≥ 1 (default 1)
 * - `limit`: integer 1..100 (default 20)
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Page number (1-indexed). Must be a positive integer. ' +
      'Values less than 1 are rejected with 400.',
    default: 1,
    minimum: 1,
    type: Number,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must not be less than 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description:
      'Number of items per page. Must be an integer between 1 and 100 (inclusive). ' +
      'Values outside this range are rejected with 400.',
    default: 20,
    minimum: 1,
    maximum: 100,
    type: Number,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must not be less than 1' })
  @Max(100, { message: 'limit must not be greater than 100' })
  limit?: number = 20;
}

/**
 * Standard pagination metadata envelope returned by all list endpoints.
 * All fields are required so clients can rely on a consistent shape.
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Wraps data with pagination metadata. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Factory that computes `totalPages` and constructs the metadata object.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 0,
  };
}
