import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CreatorEventSearchStatus {
  Active = 'active',
  Finished = 'finished',
  Upcoming = 'upcoming',
  All = 'all',
}

export class SearchEventsQueryDto {
  @ApiProperty({
    description:
      'Full-text search query matched against title, description, and creator address.',
    example: 'champions league',
  })
  @IsString()
  q: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @ApiPropertyOptional({
    enum: CreatorEventSearchStatus,
    default: CreatorEventSearchStatus.All,
  })
  @IsOptional()
  @IsEnum(CreatorEventSearchStatus)
  status: CreatorEventSearchStatus = CreatorEventSearchStatus.All;

  @ApiPropertyOptional({
    description: 'Filter results to a specific creator address.',
    example: '0x1234567890abcdef1234567890abcdef12345678',
  })
  @IsOptional()
  @IsString()
  creator?: string;
}
