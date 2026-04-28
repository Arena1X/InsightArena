import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveMarketDto {
  @ApiProperty({ description: 'The winning outcome for the market' })
  @IsString()
  @IsNotEmpty()
  resolved_outcome: string;

  @ApiPropertyOptional({
    description: 'Optional note explaining the resolution',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  resolution_note?: string;
}
