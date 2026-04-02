import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveMarketDto {
  @ApiProperty({ description: 'The winning outcome for the market' })
  @IsString()
  @IsNotEmpty()
  resolved_outcome: string;
}
