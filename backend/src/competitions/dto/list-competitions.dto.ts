import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompetitionVisibility } from '../entities/competition.entity';

export enum CompetitionStatus {
  Active = 'active',
  Upcoming = 'upcoming',
  Ended = 'ended',
}

export class ListCompetitionsDto {
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
    enum: CompetitionStatus,
    description: 'Filter by competition status',
  })
  @IsOptional()
  @IsEnum(CompetitionStatus)
  status?: CompetitionStatus;

  @ApiPropertyOptional({
    enum: CompetitionVisibility,
    description: 'Filter by visibility',
  })
  @IsOptional()
  @IsEnum(CompetitionVisibility)
  visibility?: CompetitionVisibility;
}

export class CompetitionListItem {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  start_time: Date;

  @ApiProperty()
  end_time: Date;

  @ApiProperty()
  prize_pool_stroops: string;

  @ApiProperty({ nullable: true })
  max_participants: number | null;

  @ApiProperty({ enum: CompetitionVisibility })
  visibility: CompetitionVisibility;

  @ApiProperty({ nullable: true })
  creator_id: string | null;

  @ApiProperty()
  participant_count: number;

  @ApiProperty({ enum: CompetitionStatus })
  status: CompetitionStatus;

  @ApiProperty({ nullable: true })
  time_remaining_ms: number | null;

  @ApiProperty()
  created_at: Date;
}

export class PaginatedCompetitionsResponse {
  @ApiProperty({ type: [CompetitionListItem] })
  data: CompetitionListItem[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
