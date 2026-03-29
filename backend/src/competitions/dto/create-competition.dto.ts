import {
  IsString,
  IsEnum,
  IsDateString,
  IsNumberString,
  IsOptional,
  IsInt,
  MinLength,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompetitionVisibility } from '../entities/competition.entity';

@ValidatorConstraint({ name: 'endAfterStart', async: false })
class EndAfterStartConstraint implements ValidatorConstraintInterface {
  validate(end_time: string, args: ValidationArguments) {
    const obj = args.object as CreateCompetitionDto;
    if (!obj.start_time || !end_time) return false;
    return new Date(end_time) > new Date(obj.start_time);
  }

  defaultMessage() {
    return 'end_time must be after start_time';
  }
}

export class CreateCompetitionDto {
  @ApiProperty({ example: 'Q1 2026 Prediction Championship' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Compete to become the top predictor of Q1 2026.' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @ApiProperty({ example: '2026-04-01T00:00:00.000Z' })
  @IsDateString()
  start_time: string;

  @ApiProperty({ example: '2026-06-30T23:59:59.000Z' })
  @IsDateString()
  @Validate(EndAfterStartConstraint)
  end_time: string;

  @ApiProperty({ description: 'Prize pool in stroops', example: '5000000000' })
  @IsNumberString()
  prize_pool_stroops: string;

  @ApiPropertyOptional({
    description: 'Max number of participants',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  max_participants?: number;

  @ApiProperty({
    enum: CompetitionVisibility,
    example: CompetitionVisibility.Public,
  })
  @IsEnum(CompetitionVisibility)
  visibility: CompetitionVisibility;
}
