import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMarketDto {
  @ApiProperty({ description: 'Market question or title', example: 'Will BTC exceed $100k by end of Q2?' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Detailed market description', example: 'Resolves YES if Bitcoin price exceeds $100,000 on any major exchange before July 1, 2026.' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ description: 'Market category', example: 'crypto' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  category: string;

  @ApiProperty({
    description: 'Possible outcomes (minimum 2)',
    example: ['yes', 'no'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(2, { message: 'outcome_options must have at least 2 entries' })
  @IsString({ each: true })
  outcome_options: string[];

  @ApiProperty({ description: 'Market end time (ISO 8601)', example: '2026-06-30T23:59:59Z' })
  @IsNotEmpty()
  @IsDateString()
  end_time: string;

  @ApiProperty({ description: 'Resolution time (ISO 8601, must be after end_time)', example: '2026-07-02T00:00:00Z' })
  @IsNotEmpty()
  @IsDateString()
  resolution_time: string;

  @ApiPropertyOptional({ description: 'Creator fee in basis points (0–500)', example: 100, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  creator_fee_bps?: number;

  @ApiPropertyOptional({ description: 'Minimum stake in XLM stroops', example: 10000000, default: 10000000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  min_stake?: number;

  @ApiPropertyOptional({ description: 'Maximum stake in XLM stroops', example: 100000000, default: 100000000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  max_stake?: number;

  @ApiPropertyOptional({ description: 'Whether the market is publicly visible', default: true })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;
}
