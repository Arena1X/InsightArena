import {
  IsOptional,
  IsInt,
  IsString,
  IsBoolean,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Result of evaluating a submission's confidence score against its data
 * source's rolling baseline. Pure value object returned by
 * `SubmissionHistoryService.evaluateAnomaly`.
 */
export interface AnomalyEvaluation {
  /** Whether the value deviates beyond the configured threshold. */
  isAnomaly: boolean;
  /** Absolute z-score, or `null` when there were too few samples to evaluate. */
  zScore: number | null;
  /** Mean of the baseline window. */
  mean: number;
  /** Population standard deviation of the baseline window. */
  stddev: number;
  /** Number of prior submissions that formed the baseline. */
  sampleSize: number;
  /** The z-score threshold used for the decision. */
  threshold: number;
  /**
   * Why the evaluation reached its verdict (e.g. `insufficient_samples`,
   * `within_threshold`, `deviation_exceeds_threshold`, `zero_variance_outlier`).
   */
  reason: string;
}

export enum ReviewDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
}

export class GetFlagsQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by oracle data source' })
  @IsOptional()
  @IsString()
  dataSource?: string;

  @ApiPropertyOptional({ description: 'Filter by match ID' })
  @IsOptional()
  @IsString()
  matchId?: string;

  @ApiPropertyOptional({
    description: 'Filter to only flags that held a submission for review',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  heldOnly?: boolean;
}

export class ReviewSubmissionDto {
  @ApiProperty({
    description: 'Whether to approve or reject the held submission',
    enum: ReviewDecision,
  })
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  @ApiPropertyOptional({
    description: 'Identifier of the admin performing the review',
  })
  @IsOptional()
  @IsString()
  reviewer?: string;

  @ApiPropertyOptional({
    description: 'Optional note recorded with the review',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class FlagResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  submission_id: string;

  @ApiProperty()
  match_id: string;

  @ApiProperty()
  data_source: string;

  @ApiProperty()
  observed_value: number;

  @ApiProperty()
  baseline_mean: number;

  @ApiProperty()
  baseline_stddev: number;

  @ApiProperty()
  deviation: number;

  @ApiProperty()
  threshold: number;

  @ApiProperty()
  sample_size: number;

  @ApiProperty()
  held: boolean;

  @ApiPropertyOptional()
  reason?: string;

  @ApiProperty()
  created_at: string;
}

export class PaginatedFlagsResponse {
  @ApiProperty({ type: [FlagResponse] })
  data: FlagResponse[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class ReviewResultResponse {
  @ApiProperty()
  submission_id: string;

  @ApiProperty({ description: 'The submission review status after the review' })
  review_status: string;

  @ApiProperty({
    description: 'Whether the approved submission was queued for on-chain use',
  })
  submitted: boolean;

  @ApiProperty()
  message: string;
}
