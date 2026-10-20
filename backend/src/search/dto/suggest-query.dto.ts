import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Prefixes shorter than this return an empty list rather than querying the DB */
export const MIN_SUGGEST_PREFIX_LENGTH = 2;

export const MAX_SUGGEST_LIMIT = 10;

export enum SuggestType {
  All = 'all',
  Markets = 'markets',
  Users = 'users',
  Competitions = 'competitions',
}

export class SuggestQueryDto {
  @ApiPropertyOptional({
    description:
      'Type-ahead prefix. Prefixes shorter than 2 characters return an empty list (no error).',
    example: 'bit',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Prefix must be a string' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @MaxLength(100, { message: 'Prefix must not exceed 100 characters' })
  q?: string;

  @ApiPropertyOptional({ enum: SuggestType, default: SuggestType.All })
  @IsOptional()
  @IsEnum(SuggestType)
  type?: SuggestType = SuggestType.All;

  @ApiPropertyOptional({
    default: MAX_SUGGEST_LIMIT,
    maximum: MAX_SUGGEST_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SUGGEST_LIMIT)
  limit?: number = MAX_SUGGEST_LIMIT;
}

export class SuggestItemDto {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty({ enum: ['market', 'user', 'competition'] })
  type: 'market' | 'user' | 'competition';
}

export class SuggestResponseDto {
  @ApiProperty({ type: [SuggestItemDto] })
  suggestions: SuggestItemDto[];
}
