import { IsEnum, IsInt, IsOptional, Max, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum EventStatus {
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled',
  All = 'all',
}

export enum EventSortBy {
  CreatedAt = 'created_at',
  ParticipantCount = 'participant_count',
  MatchCount = 'match_count',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export class ListEventsQueryDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Items per page (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    enum: EventStatus,
    default: EventStatus.All,
    description: 'Filter by event status',
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status: EventStatus = EventStatus.All;

  @ApiPropertyOptional({
    description: 'Filter by creator address',
  })
  @IsOptional()
  @IsString()
  creator: string;

  @ApiPropertyOptional({
    description: 'Search in title and description',
  })
  @IsOptional()
  @IsString()
  search: string;

  @ApiPropertyOptional({
    enum: EventSortBy,
    default: EventSortBy.CreatedAt,
    description: 'Sort by field',
  })
  @IsOptional()
  @IsEnum(EventSortBy)
  sortBy: EventSortBy = EventSortBy.CreatedAt;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.Desc,
    description: 'Sort order',
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.Desc;
}
