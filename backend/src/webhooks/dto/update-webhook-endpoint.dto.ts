import {
  IsString,
  IsUrl,
  IsArray,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class UpdateWebhookEndpointDto {
  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  event_types?: string[];

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
