import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsObject,
} from 'class-validator';

export class CreatorInfoDto {
  @IsString()
  id: string;

  @IsString()
  stellar_address: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  avatar_url?: string;

  @IsString()
  is_verified: boolean;
}

export class FlagDto {
  @IsString()
  id: string;

  @IsString()
  reason: string;

  @IsString()
  status: string;

  @IsString()
  created_at: string;
}

export class AdminActionDto {
  @IsString()
  id: string;

  @IsString()
  action: string;

  @IsString()
  admin_id: string;

  @IsString()
  reason?: string;

  @IsString()
  created_at: string;
}

export class CreatorEventModerationDto {
  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  status: string;

  @IsObject()
  creator: CreatorInfoDto;

  @IsNumber()
  participant_count: number;

  @IsNumber()
  match_count: number;

  @IsArray()
  @IsOptional()
  flags?: FlagDto[];

  @IsArray()
  @IsOptional()
  admin_actions?: AdminActionDto[];

  @IsString()
  created_at: string;

  @IsString()
  updated_at: string;
}

export class PaginatedCreatorEventsModerationResponseDto {
  @IsArray()
  data: CreatorEventModerationDto[];

  @IsNumber()
  total: number;

  @IsNumber()
  page: number;

  @IsNumber()
  limit: number;
}
