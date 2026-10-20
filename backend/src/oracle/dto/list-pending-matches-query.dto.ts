import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListPendingMatchesQueryDto {
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
}

export interface PendingMatchResponse {
  match: {
    id: string;
    on_chain_match_id: string;
    team_a: string;
    team_b: string;
    match_time: string;
    result_submitted: boolean;
    prediction_count: number;
    created_at: string;
  };
  event: {
    id: string;
    on_chain_event_id: string;
    title: string;
    creator_address: string;
  };
  time_since_match_started_seconds: number;
}

export interface PaginatedPendingMatchesResponse {
  data: PendingMatchResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface OracleStatsResponse {
  pending: number;
  resolved: number;
  overdue: number;
}
