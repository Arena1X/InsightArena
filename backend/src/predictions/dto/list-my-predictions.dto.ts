import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum PredictionStatus {
  Active = 'active',
  Won = 'won',
  Lost = 'lost',
  Pending = 'pending',
}

export class ListMyPredictionsDto {
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
    description: 'Filter by prediction status',
    enum: PredictionStatus,
  })
  @IsOptional()
  @IsEnum(PredictionStatus)
  status?: PredictionStatus;
}

export interface PredictionWithStatus {
  id: string;
  chosen_outcome: string;
  stake_amount_stroops: string;
  payout_claimed: boolean;
  payout_amount_stroops: string;
  tx_hash: string | null;
  note: string | null;
  submitted_at: Date;
  status: PredictionStatus;
  market: {
    id: string;
    title: string;
    end_time: Date;
    resolved_outcome: string | null;
    is_resolved: boolean;
    is_cancelled: boolean;
  };
}

export interface PaginatedMyPredictionsResponse {
  data: PredictionWithStatus[];
  total: number;
  page: number;
  limit: number;
}
