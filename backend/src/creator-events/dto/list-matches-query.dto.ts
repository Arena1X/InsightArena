import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum MatchStatus {
  Pending = 'pending',
  Completed = 'completed',
  All = 'all',
}

export enum MatchSortBy {
  MatchTime = 'match_time',
  CreatedAt = 'created_at',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export class ListMatchesQueryDto {
  @ApiPropertyOptional({
    enum: MatchStatus,
    default: MatchStatus.All,
    description: 'Filter matches by status',
  })
  @IsOptional()
  @IsEnum(MatchStatus)
  status: MatchStatus = MatchStatus.All;

  @ApiPropertyOptional({
    enum: MatchSortBy,
    default: MatchSortBy.MatchTime,
    description: 'Sort matches by field',
  })
  @IsOptional()
  @IsEnum(MatchSortBy)
  sortBy: MatchSortBy = MatchSortBy.MatchTime;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.Asc,
    description: 'Sort order (ascending by default)',
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.Asc;
}
