import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class BackfillDto {
  @ApiProperty({ description: 'Starting ledger number (inclusive)' })
  @IsInt()
  @Min(1)
  from_ledger: number;

  @ApiProperty({ description: 'Ending ledger number (inclusive)' })
  @IsInt()
  @Min(1)
  to_ledger: number;
}

export class BackfillResponseDto {
  @ApiProperty()
  total_fetched: number;

  @ApiProperty()
  newly_processed: number;

  @ApiProperty()
  already_indexed: number;

  @ApiProperty()
  errors: number;

  @ApiProperty()
  from_ledger: number;

  @ApiProperty()
  to_ledger: number;
}
