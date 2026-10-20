import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'My Bot Key', maxLength: 100 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: ['predictions:read', 'markets:read'],
    description: 'List of scopes this key is permitted to use',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  scopes: string[];

  @ApiPropertyOptional({
    example: '2027-01-01T00:00:00.000Z',
    description: 'Optional ISO-8601 expiry date; omit for a non-expiring key',
  })
  @IsOptional()
  @IsDateString()
  expires_at?: string;
}
