import { ApiProperty } from '@nestjs/swagger';

class FeeHistoryItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  old_fee_stroops: string;

  @ApiProperty()
  new_fee_stroops: string;

  @ApiProperty({ nullable: true })
  updated_by: string | null;

  @ApiProperty()
  created_at: Date;
}

export class FeeStatsResponseDto {
  @ApiProperty()
  current_creation_fee: string;

  @ApiProperty()
  total_fees_collected: string;

  @ApiProperty()
  fees_collected_this_month: string;

  @ApiProperty()
  fees_collected_this_week: string;

  @ApiProperty()
  total_events_created: number;

  @ApiProperty()
  average_fee_per_event: string;

  @ApiProperty()
  treasury_balance: string;

  @ApiProperty({ type: [FeeHistoryItemDto] })
  fee_history: FeeHistoryItemDto[];
}
