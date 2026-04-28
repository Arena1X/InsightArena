import {
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MarketCategory } from './create-market.dto';

export class UpdateMarketDto {
  @ApiProperty({
    description: 'Market title',
    example: 'Will BTC reach $100k by end of 2026?',
    minLength: 5,
    maxLength: 200,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title?: string;

  @ApiProperty({
    description: 'Detailed market description',
    example: 'This market resolves YES if Bitcoin reaches $100,000 USD...',
    minLength: 10,
    maxLength: 2000,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    description: 'Market category',
    enum: MarketCategory,
    example: MarketCategory.Crypto,
    required: false,
  })
  @IsOptional()
  @IsEnum(MarketCategory)
  category?: MarketCategory;
}
