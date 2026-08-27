import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  MaxLength,
  Validate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsNotWhitespaceOnly } from './search-query.dto';

export class FuzzySearchDto {
  @ApiProperty({
    description: 'Search query for typo-tolerant matching (2-100 characters)',
    example: 'preidction',
    minLength: 2,
    maxLength: 100,
  })
  @IsString({ message: 'Search query must be a string' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return value.trim().replace(/\s+/g, ' ');
  })
  @Validate(IsNotWhitespaceOnly)
  @MinLength(2, {
    message: 'Search query must be at least 2 characters long',
  })
  @MaxLength(100, {
    message: 'Search query must not exceed 100 characters',
  })
  query: string;

  @ApiPropertyOptional({
    default: 0.1,
    description: 'Minimum trigram similarity score (0-1)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number = 0.1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class FuzzySearchItemDto {
  @ApiProperty() id: string;
  @ApiProperty() type: 'market' | 'user' | 'competition';
  @ApiProperty() title: string;
  @ApiProperty() similarity: number;
  @ApiPropertyOptional() description?: string;
}

export class FuzzySearchResponseDto {
  @ApiProperty({ type: [FuzzySearchItemDto] })
  data: FuzzySearchItemDto[];

  @ApiProperty() total: number;
  @ApiProperty() query: string;
}
