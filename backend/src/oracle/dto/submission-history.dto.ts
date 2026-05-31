import {
  IsOptional,
  IsInt,
  IsEnum,
  IsString,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { SubmissionStatus } from '../entities/oracle-submission.entity';

export class GetSubmissionsQueryDto {
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
    description: 'Filter by submission status',
    enum: SubmissionStatus,
  })
  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  @ApiPropertyOptional({
    description: 'Filter by date from (ISO 8601 format)',
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter by date to (ISO 8601 format)',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Filter by match ID',
    example: '123',
  })
  @IsOptional()
  @IsString()
  matchId?: string;
}

export class SubmissionResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  match_id: string;

  @ApiProperty()
  team_a: string;

  @ApiProperty()
  team_b: string;

  @ApiProperty()
  winning_team: string;

  @ApiProperty()
  confidence_score: number;

  @ApiProperty()
  data_source: string;

  @ApiProperty()
  result_timestamp: string;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;

  @ApiProperty()
  status: SubmissionStatus;

  @ApiPropertyOptional()
  transaction_hash?: string;

  @ApiPropertyOptional()
  submitted_at?: string;

  @ApiPropertyOptional()
  error_message?: string;

  @ApiProperty()
  retry_count: number;

  @ApiPropertyOptional()
  submission_time_ms?: number;

  @ApiProperty()
  created_at: string;
}

export class SubmissionStatistics {
  @ApiProperty()
  total_submissions: number;

  @ApiProperty()
  successful_submissions: number;

  @ApiProperty()
  failed_submissions: number;

  @ApiProperty()
  pending_submissions: number;

  @ApiProperty()
  success_rate: number;

  @ApiProperty()
  average_submission_time_ms: number;

  @ApiProperty()
  submissions_by_status: Record<SubmissionStatus, number>;
}

export class PaginatedSubmissionsResponse {
  @ApiProperty({ type: [SubmissionResponse] })
  data: SubmissionResponse[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty({ type: SubmissionStatistics })
  statistics: SubmissionStatistics;
}
