import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DisputeResolution } from '../entities/dispute.entity';

export class CastVoteDto {
  @ApiProperty({
    description: 'The outcome this voter supports for the dispute',
    enum: DisputeResolution,
    example: DisputeResolution.OVERTURNED,
  })
  @IsEnum(DisputeResolution)
  @IsNotEmpty()
  outcome: DisputeResolution;
}
