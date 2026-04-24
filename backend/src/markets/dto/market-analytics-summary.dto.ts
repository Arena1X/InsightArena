import { ApiProperty } from '@nestjs/swagger';

export class MarketOutcomeDistributionItemDto {
  @ApiProperty({ example: 'YES' })
  outcome: string;

  @ApiProperty({ example: 20 })
  count: number;

  @ApiProperty({ example: 66.67 })
  percentage: number;
}

export class MarketAnalyticsSummaryDto {
  @ApiProperty({ example: '5000000' })
  poolSize: string;

  @ApiProperty({ example: 25 })
  participantCount: number;

  @ApiProperty({
    type: [MarketOutcomeDistributionItemDto],
  })
  outcomeDistribution: MarketOutcomeDistributionItemDto[];

  @ApiProperty({ example: 3600 })
  timeRemaining: number;

  @ApiProperty({ example: '2500000' })
  volume24h: string;
}
