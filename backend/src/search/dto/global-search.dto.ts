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
  MaxLength,
  Validate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsNotWhitespaceOnly } from './search-query.dto';

export enum SearchType {
  All = 'all',
  Markets = 'markets',
  Users = 'users',
  Competitions = 'competitions',
}

export class GlobalSearchDto {
  @ApiProperty({
    description:
      'Search query string (2-100 characters, trimmed, wildcards escaped)',
    example: 'bitcoin',
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
  @ApiProperty({
    description: 'Combined relevance score (FTS rank + trigram similarity)',
  })
  relevance_score: number;
  @ApiProperty({
    description:
      'Highlighted snippet showing the matched term in context (HTML <b> tags)',
  })
  highlight: string;
}

export class UserSearchResult {
  @ApiProperty() id: string;
  @ApiProperty() username: string | null;
  @ApiProperty() stellar_address: string;
  @ApiProperty() avatar_url: string | null;
  @ApiProperty() reputation_score: number;
  @ApiProperty() total_predictions: number;
  @ApiProperty({
    description: 'Combined relevance score (FTS rank + trigram similarity)',
  })
  relevance_score: number;
  @ApiProperty({
    description:
      'Highlighted snippet showing the matched term in context (HTML <b> tags)',
  })
  highlight: string;
}

export class CompetitionSearchResult {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() start_time: Date;
  @ApiProperty() end_time: Date;
  @ApiProperty() participant_count: number;
  @ApiProperty() visibility: string;
  @ApiProperty({
    description: 'Combined relevance score (FTS rank + trigram similarity)',
  })
  relevance_score: number;
  @ApiProperty({
    description:
      'Highlighted snippet showing the matched term in context (HTML <b> tags)',
  })
  highlight: string;
}

export class SuggestionsResponseDto {
  @ApiProperty({
    type: [String],
    description: 'Up to 5 matching market titles',
  })
  markets: string[];

  @ApiProperty({ type: [String], description: 'Up to 5 matching usernames' })
  users: string[];
}

export class GlobalSearchResponseDto {
  @ApiProperty({ type: [MarketSearchResult] })
  markets: MarketSearchResult[];

  @ApiProperty({ type: [UserSearchResult] })
  users: UserSearchResult[];

  @ApiProperty({ type: [CompetitionSearchResult] })
  competitions: CompetitionSearchResult[];

  @ApiProperty() total: number;
  @ApiPropertyOptional() total_markets?: number;
  @ApiPropertyOptional() total_users?: number;
  @ApiPropertyOptional() total_competitions?: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
