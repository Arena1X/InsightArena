import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WinningTeam } from '../entities/match.entity';

export class SubmitMatchResultDto {
  @ApiProperty({
    description:
      'Final score for team A (home). Must be a non-negative integer.',
    example: 2,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt({ message: 'home_score must be an integer' })
  @Min(0, { message: 'home_score must not be negative' })
  home_score!: number;

  @ApiProperty({
    description:
      'Final score for team B (away). Must be a non-negative integer.',
    example: 1,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt({ message: 'away_score must be an integer' })
  @Min(0, { message: 'away_score must not be negative' })
  away_score!: number;

  @ApiProperty({
    description: 'Winning side - must be consistent with the submitted scores',
    enum: WinningTeam,
    example: WinningTeam.TEAM_A,
  })
  @IsEnum(WinningTeam, {
    message: `winning_team must be one of: ${Object.values(WinningTeam).join(', ')}`,
  })
  winning_team!: WinningTeam;

  @ApiPropertyOptional({
    description:
      'Free-text source of the result (e.g. "official feed", "manual verification")',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  result_source?: string;
}
