import {
  IsString,
  IsNumberString,
  IsOptional,
  IsInt,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCompetitionDto {
  @ApiPropertyOptional({ example: 'Updated Championship Title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated competition description.' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Prize pool in stroops',
    example: '10000000000',
  })
  @IsOptional()
  @IsNumberString()
  prize_pool_stroops?: string;

  @ApiPropertyOptional({
    description: 'Max number of participants',
    example: 200,
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  max_participants?: number;
}
