import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LeaderboardQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

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
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by season ID (omit for all-time leaderboard)',
  })
  @IsOptional()
  @IsString()
  season_id?: string;
}

export interface LeaderboardEntryResponse {
  rank: number;
  user_id: string;
  username: string | null;
  stellar_address: string;
  reputation_score: number;
  accuracy_rate: string;
  total_winnings_stroops: string;
  season_points?: number;
}

export interface PaginatedLeaderboardResponse {
  data: LeaderboardEntryResponse[];
  total: number;
  page: number;
  limit: number;
}
