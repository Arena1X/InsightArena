import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { FlagResolutionAction } from '../entities/flag.entity';

export class ResolveFlagDto {
  @IsEnum(FlagResolutionAction)
  action: FlagResolutionAction;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  admin_notes?: string;
}
