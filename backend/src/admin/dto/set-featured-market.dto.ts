import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class SetFeaturedMarketDto {
  @ApiPropertyOptional({
    description: 'Whether the market is featured',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @ApiPropertyOptional({
    description: 'Display order for featured markets',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  featured_order?: number;

  @ApiPropertyOptional({
    description: 'Expiration date for featured status',
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  featured_expires_at?: string;
}
