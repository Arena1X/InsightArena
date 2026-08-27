import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CursorPaginationDto {
  @ApiPropertyOptional({
    description:
      'Opaque pagination cursor from a previous response\'s nextCursor. Omit for the first page.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

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

export interface CursorPaginationEntry {
  rank: number;
  user_id: string;
  username: string | null;
  stellar_address: string;
  reputation_score: number;
  accuracy_rate: string;
  total_winnings_stroops: string;
  season_points?: number;
  cursor: string;
}

export interface PaginatedCursorResponse {
  data: CursorPaginationEntry[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}
