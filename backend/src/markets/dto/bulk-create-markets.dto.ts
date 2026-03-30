import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateMarketDto } from './create-market.dto';

export class BulkCreateMarketsDto {
  @ApiProperty({
    description: 'Array of market DTOs to create (max 10)',
    type: [CreateMarketDto],
    minItems: 1,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least 1 market is required' })
  @ArrayMaxSize(10, { message: 'Maximum 10 markets per request' })
  @ValidateNested({ each: true })
  @Type(() => CreateMarketDto)
  markets: CreateMarketDto[];
}
