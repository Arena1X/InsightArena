import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchHighlightsDto {
  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  creator_address?: string;
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

  @ApiProperty({ type: SearchHighlightsDto })
  highlights: SearchHighlightsDto;

  @ApiPropertyOptional({ description: 'Event category' })
  category?: string;
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
