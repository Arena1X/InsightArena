import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DisputeResolution } from '../entities/dispute.entity';

export class ResolveDisputeDto {
  @ApiProperty({
    description: 'Resolution of the dispute',
    enum: DisputeResolution,
    example: DisputeResolution.UPHELD,
  })
  @IsEnum(DisputeResolution)
  @IsNotEmpty()
  resolution: DisputeResolution;

  @ApiProperty({
    description: 'Admin notes about the resolution',
    example: 'After reviewing evidence, the original outcome was upheld.',
    maxLength: 1000,
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  admin_notes?: string;
}
