import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListSeasonsDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 50)',
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class SeasonTopWinnerDto {
  @ApiProperty()
  user_id: string;

  @ApiPropertyOptional({ nullable: true })
  username: string | null;

  @ApiProperty()
  stellar_address: string;
}

export class SeasonListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  season_number: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  starts_at: Date;

  @ApiProperty()
  ends_at: Date;

  @ApiProperty()
  reward_pool_stroops: string;

  @ApiProperty()
  is_active: boolean;

  @ApiProperty()
  is_finalized: boolean;

  @ApiPropertyOptional({ nullable: true })
  on_chain_season_id: number | null;

  @ApiPropertyOptional({ nullable: true })
  soroban_tx_hash: string | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiPropertyOptional({
    type: SeasonTopWinnerDto,
    nullable: true,
    description:
      'Populated only when the season is finalized and a winner is recorded',
  })
  top_winner: SeasonTopWinnerDto | null;
}

export class PaginatedSeasonsResponseDto {
  @ApiProperty({ type: [SeasonListItemDto] })
  data: SeasonListItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export type PaginatedSeasonsResponse = PaginatedSeasonsResponseDto;
