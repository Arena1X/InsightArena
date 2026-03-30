import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export enum SearchType {
  All = 'all',
  Markets = 'markets',
  Users = 'users',
  Competitions = 'competitions',
}

export class GlobalSearchDto {
  @ApiProperty({ description: 'Search query string', example: 'bitcoin' })
  @IsString()
  @MinLength(1)
  query: string;

  @ApiPropertyOptional({
    enum: SearchType,
    default: SearchType.All,
    description: 'Filter results by entity type',
  })
  @IsOptional()
  @IsEnum(SearchType)
  type?: SearchType = SearchType.All;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class MarketSearchResult {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() category: string;
  @ApiProperty() is_resolved: boolean;
  @ApiProperty() is_public: boolean;
  @ApiProperty() participant_count: number;
  @ApiProperty() created_at: Date;
}

export class UserSearchResult {
  @ApiProperty() id: string;
  @ApiProperty() username: string | null;
  @ApiProperty() stellar_address: string;
  @ApiProperty() avatar_url: string | null;
  @ApiProperty() reputation_score: number;
  @ApiProperty() total_predictions: number;
}

export class CompetitionSearchResult {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() start_time: Date;
  @ApiProperty() end_time: Date;
  @ApiProperty() participant_count: number;
  @ApiProperty() visibility: string;
}

export class GlobalSearchResponseDto {
  @ApiProperty({ type: [MarketSearchResult] })
  markets: MarketSearchResult[];

  @ApiProperty({ type: [UserSearchResult] })
  users: UserSearchResult[];

  @ApiProperty({ type: [CompetitionSearchResult] })
  competitions: CompetitionSearchResult[];

  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
