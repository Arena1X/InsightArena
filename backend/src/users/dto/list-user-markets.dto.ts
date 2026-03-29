import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum UserMarketFilterStatus {
  Active = 'active',
  Resolved = 'resolved',
  Cancelled = 'cancelled',
}

export enum UserMarketsSortBy {
  CreatedAt = 'created_at',
  ParticipantCount = 'participant_count',
}

export enum UserMarketsSortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export class ListUserMarketsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: UserMarketFilterStatus })
  @IsOptional()
  @IsEnum(UserMarketFilterStatus)
  status?: UserMarketFilterStatus;

  @ApiPropertyOptional({
    enum: UserMarketsSortBy,
    default: UserMarketsSortBy.CreatedAt,
  })
  @IsOptional()
  @IsEnum(UserMarketsSortBy)
  sort_by?: UserMarketsSortBy = UserMarketsSortBy.CreatedAt;

  @ApiPropertyOptional({
    enum: UserMarketsSortOrder,
    default: UserMarketsSortOrder.Desc,
  })
  @IsOptional()
  @IsEnum(UserMarketsSortOrder)
  order?: UserMarketsSortOrder = UserMarketsSortOrder.Desc;
}

export class PaginatedUserMarketsResponse {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
}
