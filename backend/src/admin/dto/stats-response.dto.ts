import { ApiProperty } from '@nestjs/swagger';

export class StatsResponseDto {
  @ApiProperty()
  total_users: number;

  @ApiProperty()
  active_users_24h: number;

  @ApiProperty()
  active_users_7d: number;

  @ApiProperty()
  total_markets: number;

  @ApiProperty()
  active_markets: number;

  @ApiProperty()
  resolved_markets: number;

  @ApiProperty()
  total_predictions: number;

  @ApiProperty()
  total_volume_stroops: string;

  @ApiProperty()
  total_competitions: number;

  @ApiProperty()
  platform_revenue_stroops: string;
}
