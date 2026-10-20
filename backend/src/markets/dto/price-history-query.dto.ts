import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum TimeRange {
  ONE_HOUR = '1h',
  ONE_DAY = '1d',
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  ALL = 'all',
}

export enum Interval {
  ONE_MINUTE = '1m',
  ONE_HOUR = '1h',
  ONE_DAY = '1d',
}

export class PriceHistoryQueryDto {
  @ApiProperty({
    enum: TimeRange,
    description:
      'The time range for the price history (e.g., 1h, 1d, 7d, 30d, all)',
  })
  @IsEnum(TimeRange)
  timeRange: TimeRange;

  @ApiProperty({
    enum: Interval,
    description: 'The bucketing interval for downsampling (e.g., 1m, 1h, 1d)',
  })
  @IsEnum(Interval)
  interval: Interval;
}
