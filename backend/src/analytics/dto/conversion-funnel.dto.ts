import { ApiProperty } from '@nestjs/swagger';

export class ConversionFunnelStageDto {
  @ApiProperty({ enum: ['signup', 'first_prediction', 'payout'] })
  stage: 'signup' | 'first_prediction' | 'payout';

  @ApiProperty()
  count: number;

  @ApiProperty({
    description: 'Conversion percentage from the previous funnel stage',
  })
  conversion_rate: number;
}

export class ConversionFunnelDto {
  @ApiProperty({ type: [ConversionFunnelStageDto] })
  stages: ConversionFunnelStageDto[];

  @ApiProperty()
  from: Date;

  @ApiProperty()
  to: Date;

  @ApiProperty()
  generated_at: Date;
}
