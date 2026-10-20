import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LeaderboardQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page (max 100)',
    default: 20,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export interface LeaderboardEntryResponse {
  rank: number;
  user_address: string;
  total_predictions: number;
  correct_predictions: number;
  accuracy_percentage: number;
  is_winner: boolean;
  completion_time: string | null;
}

export interface PaginatedLeaderboardResponse {
  data: LeaderboardEntryResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  source: 'contract' | 'cache';
}
