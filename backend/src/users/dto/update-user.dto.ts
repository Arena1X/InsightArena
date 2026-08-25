import {
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Display name (alphanumeric, 3–30 chars)',
    example: 'StellarTrader42',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(3, { message: 'username must be at least 3 characters' })
  @MaxLength(30, { message: 'username must be at most 30 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username must be alphanumeric (letters, numbers, underscores)',
  })
  username?: string;

  @ApiPropertyOptional({
    description: 'Profile avatar URL',
    example: 'https://example.com/avatar.png',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsUrl({}, { message: 'avatar_url must be a valid URL' })
  avatar_url?: string;
}
