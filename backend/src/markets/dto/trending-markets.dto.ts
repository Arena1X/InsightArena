import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrendingMarketsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 50)',
    default: 20,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class TrendingMarketItem {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  outcome_options: string[];

  @ApiProperty()
  end_time: Date;

  @ApiProperty()
  is_resolved: boolean;

  @ApiProperty()
  participant_count: number;

  @ApiProperty()
  total_pool_stroops: string;

  @ApiProperty()
  trending_score: number;

  @ApiProperty()
  created_at: Date;
}

export class PaginatedTrendingMarketsResponse {
  @ApiProperty({ type: [TrendingMarketItem] })
  data: TrendingMarketItem[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
