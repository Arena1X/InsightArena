import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum WinningTeam {
  TEAM_A = 'TEAM_A',
  TEAM_B = 'TEAM_B',
  DRAW = 'DRAW',
}

export class WebhookMatchResultDto {
  @ApiProperty({
    description: 'The on-chain match ID',
    example: '123',
  })
  @IsString()
  match_id: string;

  @ApiProperty({
    description: 'The winning team',
    enum: WinningTeam,
    example: WinningTeam.TEAM_A,
  })
  @IsEnum(WinningTeam)
  winning_team: WinningTeam;

  @ApiProperty({
    description: 'Confidence score (0-100)',
    example: 95,
    minimum: 0,
    maximum: 100,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  confidence_score: number;

  @ApiProperty({
    description: 'Data source URL or identifier',
    example: 'https://api.sports-data.com/matches/123',
  })
  @IsString()
  data_source: string;

  @ApiProperty({
    description: 'Timestamp of the result',
    example: '2024-01-15T10:30:00Z',
  })
  @IsString()
  timestamp: string;

  @ApiPropertyOptional({
    description: 'Additional metadata about the result',
    example: { final_score: '2-1', referee: 'John Doe' },
  })
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Client-supplied key identifying this result delivery. Repeating a call with the same key returns the original job instead of submitting again. When omitted, a key is derived from match_id, data_source, winning_team, confidence_score and timestamp.',
    example: 'sports-data-123-final',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotency_key?: string;
}

export class WebhookResponseDto {
  @ApiProperty({
    description: 'Job ID for tracking the submission',
    example: 'job_abc123xyz',
  })
  job_id: string;

  @ApiProperty({
    description: 'Status of the webhook request',
    example: 'accepted',
  })
  status: string;

  @ApiProperty({
    description: 'Message describing the result',
    example: 'Match result queued for submission',
  })
  message: string;

  @ApiPropertyOptional({
    description:
      'True when this call duplicated an earlier one and no new submission was made',
    example: false,
  })
  duplicate?: boolean;

  @ApiPropertyOptional({
    description: 'ID of the oracle submission record backing this job',
  })
  submission_id?: string;
}
