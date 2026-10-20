import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListMarketPredictionsDto {
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
}

export class MarketPredictionResponseDto {
  @ApiProperty({ description: 'Prediction ID' })
  id: string;

  @ApiProperty({ description: 'Selected outcome option' })
  chosen_outcome: string;

  @ApiProperty({ description: 'Stake amount in stroops' })
  stake_amount_stroops: string;

  @ApiProperty({ description: 'Whether payout has been claimed' })
  payout_claimed: boolean;

  @ApiProperty({ description: 'Claimed payout amount in stroops' })
  payout_amount_stroops: string;

  @ApiProperty({
    description: 'Latest related transaction hash',
    nullable: true,
  })
  tx_hash: string | null;

  @ApiProperty({ description: 'Prediction submission time' })
  submitted_at: Date;
}

export class PaginatedMarketPredictionsResponseDto {
  @ApiProperty({ type: [MarketPredictionResponseDto] })
  data: MarketPredictionResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export type PaginatedMarketPredictionsResponse =
  PaginatedMarketPredictionsResponseDto;
