import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUserPreferencesDto {
  @IsOptional()
  @IsBoolean()
  email_notifications?: boolean;

  @IsOptional()
  @IsBoolean()
  market_resolution_notifications?: boolean;

  @IsOptional()
  @IsBoolean()
  competition_notifications?: boolean;

  @IsOptional()
  @IsBoolean()
  leaderboard_notifications?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing_emails?: boolean;
}

export class UserPreferencesResponseDto {
  id: string;
  email_notifications: boolean;
  market_resolution_notifications: boolean;
  competition_notifications: boolean;
  leaderboard_notifications: boolean;
  marketing_emails: boolean;
  created_at: Date;
  updated_at: Date;
}
