import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'isAfterStartTime', async: false })
class IsAfterStartTimeConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    const obj = args.object as CreateSeasonDto;
    if (!obj.start_time || !value) return false;
    return new Date(value) > new Date(obj.start_time);
  }

  defaultMessage() {
    return 'end_time must be after start_time';
  }
}

@ValidatorConstraint({ name: 'isPositiveBigIntString', async: false })
class IsPositiveBigIntStringConstraint implements ValidatorConstraintInterface {
  validate(value: string) {
    try {
      return BigInt(value) > 0n;
    } catch {
      return false;
    }
  }

  defaultMessage() {
    return 'reward_pool_stroops must be a positive integer string (stroops)';
  }
}

export class CreateSeasonDto {
  @ApiProperty({ example: 3, minimum: 1 })
  @IsInt()
  @Min(1)
  season_number: number;

  @ApiProperty({ example: '2026-04-01T00:00:00.000Z' })
  @IsDateString()
  start_time: string;

  @ApiProperty({ example: '2026-06-30T23:59:59.000Z' })
  @IsDateString()
  @Validate(IsAfterStartTimeConstraint)
  end_time: string;

  @ApiProperty({
    example: '50000000000',
    description: 'Reward pool size in stroops (positive bigint as string)',
  })
  @IsNumberString({ no_symbols: true })
  @Validate(IsPositiveBigIntStringConstraint)
  reward_pool_stroops: string;

  @ApiPropertyOptional({
    description:
      'If true, invokes the Soroban contract after persisting the season (rolls back DB row on failure)',
  })
  @IsOptional()
  @IsBoolean()
  sync_soroban?: boolean;
}
