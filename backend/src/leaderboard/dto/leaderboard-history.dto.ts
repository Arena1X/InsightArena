import { IsOptional, IsDateString, IsUUID, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LeaderboardHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Filter by specific date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Filter by season ID' })
  @IsOptional()
  @IsUUID()
  season_id?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class LeaderboardHistoryEntryResponse {
  @ApiProperty()
  rank: number;

  @ApiProperty()
  user_id: string;

  @ApiProperty({ nullable: true })
  username: string | null;

  @ApiProperty()
  stellar_address: string;

  @ApiProperty()
  reputation_score: number;

  @ApiProperty()
  accuracy_rate: string;

  @ApiProperty()
  total_winnings_stroops: string;

  @ApiProperty()
  season_points: number;

  @ApiProperty()
  snapshot_date: Date;

  @ApiProperty({ nullable: true })
  rank_change?: number | null;
}

export class PaginatedLeaderboardHistoryResponse {
  @ApiProperty({ type: [LeaderboardHistoryEntryResponse] })
  data: LeaderboardHistoryEntryResponse[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
