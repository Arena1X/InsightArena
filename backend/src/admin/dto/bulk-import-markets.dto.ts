import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkImportMarketsDto {
  @ApiProperty({
    description:
      'CSV text of market definitions. Header row required. Columns: ' +
      'title,description,category,outcome_options,end_time,resolution_time,' +
      'creator_fee_bps,min_stake_stroops,max_stake_stroops,is_public. ' +
      'outcome_options is semicolon-separated (e.g. "Yes;No") since commas ' +
      'are the CSV delimiter.',
    example:
      'title,description,category,outcome_options,end_time,resolution_time,creator_fee_bps,min_stake_stroops,max_stake_stroops,is_public\n' +
      'Will BTC hit 100k?,Resolves YES if BTC >= 100000 USD,Crypto,Yes;No,2026-12-31T23:59:59.000Z,2027-01-07T23:59:59.000Z,100,10000000,1000000000,true',
  })
  @IsString()
  @IsNotEmpty()
  csv: string;
}

export interface BulkImportRowResult {
  row: number;
  status: 'created' | 'failed';
  market_id?: string;
  errors?: string[];
}

export interface BulkImportMarketsResponseDto {
  total: number;
  created_count: number;
  failed_count: number;
  results: BulkImportRowResult[];
}
