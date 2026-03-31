import {
  IsUUID,
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { FlagReason } from '../entities/flag.entity';

export class CreateFlagDto {
  @IsUUID()
  market_id: string;

  @IsEnum(FlagReason)
  reason: FlagReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
