import { IsOptional, IsDateString, IsUUID, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LeaderboardSnapshotQueryDto {
  @ApiProperty({
    description:
      'Return rankings as of this date (YYYY-MM-DD). The nearest snapshot on or before this date is used.',
    example: '2026-07-01',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Filter by season ID' })
  @IsOptional()
  @IsUUID()
  season_id?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class SnapshotRankingEntryResponse {
  @ApiProperty()
  rank: number;

  @ApiProperty()
  user_id: string;

  @ApiProperty({ nullable: true })
  username: string | null;

  @ApiProperty()
  stellar_address: string;

  @ApiProperty()
  score: number;

  @ApiProperty()
  captured_at: Date;
}

export class PaginatedSnapshotRankingResponse {
  @ApiProperty({ type: [SnapshotRankingEntryResponse] })
  data: SnapshotRankingEntryResponse[];

  @ApiProperty({
    description:
      'The actual snapshot date used to satisfy the query (nearest on or before the requested date)',
  })
  snapshot_date: Date;

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty({
    description:
      'Message returned when the requested date is outside the retention window',
    nullable: true,
  })
  message?: string;
}
