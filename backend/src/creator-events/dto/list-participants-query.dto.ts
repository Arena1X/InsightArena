import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ParticipantSortBy {
  JoinedAt = 'joined_at',
  Score = 'score',
  Address = 'address',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export class ListParticipantsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    enum: ParticipantSortBy,
    default: ParticipantSortBy.JoinedAt,
  })
  @IsOptional()
  @IsEnum(ParticipantSortBy)
  sortBy: ParticipantSortBy = ParticipantSortBy.JoinedAt;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.Desc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.Desc;
}
