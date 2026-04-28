import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum PublicPredictionOutcomeFilter {
  Correct = 'correct',
  Incorrect = 'incorrect',
  Pending = 'pending',
}

export class ListUserPredictionsDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter predictions by computed outcome',
    enum: PublicPredictionOutcomeFilter,
  })
  @IsOptional()
  @IsEnum(PublicPredictionOutcomeFilter)
  outcome?: PublicPredictionOutcomeFilter;
}

export interface PublicUserPredictionItem {
  id: string;
  chosen_outcome: string;
  stake_amount_stroops: string;
  payout_claimed: boolean;
  payout_amount_stroops: string;
  tx_hash: string | null;
  submitted_at: Date;
  outcome: PublicPredictionOutcomeFilter;
  market: {
    id: string;
    title: string;
    end_time: Date;
    resolved_outcome: string | null;
    is_resolved: boolean;
    is_cancelled: boolean;
  };
}

export interface PaginatedPublicUserPredictionsResponse {
  data: PublicUserPredictionItem[];
  total: number;
  page: number;
  limit: number;
}
