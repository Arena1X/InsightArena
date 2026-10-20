import {
  IsOptional,
  IsEnum,
  IsString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export enum EventStatus {
  Active = 'active',
  Cancelled = 'cancelled',
  Completed = 'completed',
  Flagged = 'flagged',
  All = 'all',
}

export enum SortBy {
  CreatedAt = 'created_at',
  UpdatedAt = 'updated_at',
  ParticipantCount = 'participant_count',
  MatchCount = 'match_count',
}

export enum SortOrder {
  Asc = 'ASC',
  Desc = 'DESC',
}

export class ListCreatorEventsQueryDto {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus = EventStatus.All;

  @IsOptional()
  @IsString()
  creator?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.CreatedAt;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.Desc;
}
