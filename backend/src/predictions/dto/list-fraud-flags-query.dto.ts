import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  FraudFlagStatus,
  FraudSignalType,
} from '../entities/prediction-fraud-flag.entity';

export class ListFraudFlagsQueryDto {
  @IsOptional()
  @IsEnum(FraudFlagStatus)
  status?: FraudFlagStatus;

  @IsOptional()
  @IsEnum(FraudSignalType)
  signal_type?: FraudSignalType;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
