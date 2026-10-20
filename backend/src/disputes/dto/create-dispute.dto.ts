import { IsString, IsUUID, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDisputeDto {
  @ApiProperty({
    description: 'ID of the market to dispute',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  market_id: string;

  @ApiProperty({
    description: 'Reason for the dispute',
    example:
      'The market outcome appears to be incorrect based on available evidence.',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
