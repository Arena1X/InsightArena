import { ApiProperty } from '@nestjs/swagger';

export class PlatformStatsDto {
  @ApiProperty({ example: 420 })
  total_markets: number;

  @ApiProperty({ example: 8750 })
  total_predictions: number;

  @ApiProperty({
    example: '52000000000',
    description: 'Sum of all market pool sizes in stroops (string bigint)',
  })
  total_volume_stroops: string;

  @ApiProperty({ example: 1200 })
  active_users: number;

  @ApiProperty({ example: 38 })
  active_markets: number;
}
