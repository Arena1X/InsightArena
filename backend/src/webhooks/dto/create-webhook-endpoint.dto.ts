import { IsString, IsUrl, IsArray } from 'class-validator';

export class CreateWebhookEndpointDto {
  @IsUrl()
  url: string;

  @IsArray()
  @IsString({ each: true })
  event_types: string[];
}
