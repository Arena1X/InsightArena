import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { FlagTargetType } from '../entities/feature-flag.entity';

export class CreateFeatureFlagDto {
  @ApiProperty({ description: 'Unique flag key' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Human-readable name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Flag description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @ApiPropertyOptional({ enum: FlagTargetType })
  @IsOptional()
  @IsEnum(FlagTargetType)
  targeting_type?: FlagTargetType;

  @ApiPropertyOptional({
    description: 'Targeting rules configuration',
    example: {
      user_ids: ['uuid1', 'uuid2'],
      attributes: { role: { operator: 'eq', value: 'admin' } },
    },
  })
  @IsOptional()
  @IsObject()
  targeting_rules?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Rollout percentage (0-100)',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rollout_percentage?: number;
}
