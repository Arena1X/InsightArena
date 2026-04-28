import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { FlagReason, FlagStatus } from '../entities/flag.entity';

export class ListFlagsQueryDto {
  @IsOptional()
  @IsEnum(FlagStatus)
  status?: FlagStatus;

  @IsOptional()
  @IsEnum(FlagReason)
  reason?: FlagReason;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;
}
