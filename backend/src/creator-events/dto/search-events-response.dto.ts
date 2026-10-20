import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchHighlightsDto {
  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  creator_address?: string;

  @ApiProperty({ required: false })
  category?: string;
}

export class SearchEventResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  on_chain_event_id: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  creator_address: string;

  @ApiProperty()
  is_active: boolean;

  @ApiProperty()
  is_cancelled: boolean;

  @ApiProperty()
  participant_count: number;

  @ApiProperty()
  match_count: number;

  @ApiProperty()
  rank: number;

  @ApiPropertyOptional({ description: 'Total prize pool in stroops' })
  prize_pool?: string;

  @ApiPropertyOptional({ description: 'Entry fee in stroops' })
  entry_fee?: string;

  @ApiPropertyOptional({ description: 'Campaign category slug' })
  category?: string;

  @ApiPropertyOptional({ description: 'Campaign banner URL' })
  banner_url?: string | null;

  @ApiPropertyOptional({
    description: 'Whether the campaign has been finalized',
  })
  is_finalized?: boolean;

  @ApiProperty({ type: SearchHighlightsDto })
  highlights: SearchHighlightsDto;
}

export class SearchEventsResponseDto {
  @ApiProperty({ type: [SearchEventResultDto] })
  data: SearchEventResultDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  query: string;
}
