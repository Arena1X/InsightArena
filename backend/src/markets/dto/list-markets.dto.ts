import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum MarketStatus {
  Open = 'open',
  Resolved = 'resolved',
  Cancelled = 'cancelled',
}

/**
 * Query DTO for the GET /markets list endpoint.
 * Extends the shared PaginationQueryDto (page, limit with 1–100 max).
 */
export class ListMarketsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: MarketStatus,
  })
  @IsOptional()
  @IsEnum(MarketStatus)
  status?: MarketStatus;

  @ApiPropertyOptional({ description: 'Filter by public/private' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({ description: 'Keyword search on title' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class PaginatedMarketsResponse {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
