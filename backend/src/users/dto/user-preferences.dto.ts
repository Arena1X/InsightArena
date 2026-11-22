import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  registerDecorator,
  ValidationOptions,
  IsArray,
  ValidateNested,
  IsNumber,
  IsUUID,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';

function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            Intl.DateTimeFormat(undefined, { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(): string {
          return 'digest_timezone must be a valid IANA timezone name (e.g. "America/Chicago")';
        },
      },
    });
  };
}

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

  @IsOptional()
  @IsIn(['daily', 'weekly', 'off'])
  digest_frequency?: 'daily' | 'weekly' | 'off';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  digest_hour?: number;

  /** IANA timezone name, e.g. "America/Chicago". */
  @IsOptional()
  @IsString()
  @IsIanaTimezone()
  digest_timezone?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceAlertConfigDto)
  price_alerts?: PriceAlertConfigDto[];
}

export class PriceAlertConfigDto {
  @IsUUID()
  id: string;

  @IsString()
  marketId: string;

  @IsIn(['YES', 'NO'])
  outcome: 'YES' | 'NO';

  @IsNumber()
  @Min(0)
  @Max(1)
  targetOdds: number;

  @IsIn(['above', 'below'])
  direction: 'above' | 'below';

  @IsBoolean()
  enabled: boolean;

  @IsISO8601()
  createdAt: string;
}

export class UserPreferencesResponseDto {
  id: string;
  email_notifications: boolean;
  market_resolution_notifications: boolean;
  competition_notifications: boolean;
  leaderboard_notifications: boolean;
  marketing_emails: boolean;
  digest_frequency: 'daily' | 'weekly' | 'off';
  digest_hour: number;
  digest_timezone: string;
  price_alerts: PriceAlertConfigDto[] | null;
  created_at: Date;
  updated_at: Date;
}
