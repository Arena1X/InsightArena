import { IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ReportTimeframe {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly',
}

export enum ReportFormat {
  JSON = 'json',
  CSV = 'csv',
}

export class ReportQueryDto {
  @ApiProperty({
    enum: ReportTimeframe,
    description: 'Timeframe for the report',
  })
  @IsEnum(ReportTimeframe)
  timeframe: ReportTimeframe;

  @ApiProperty({
    enum: ReportFormat,
    description: 'Output format (json or csv)',
    required: false,
    default: ReportFormat.JSON,
  })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat = ReportFormat.JSON;
}
