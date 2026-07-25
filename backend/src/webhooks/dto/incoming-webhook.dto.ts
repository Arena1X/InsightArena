import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IncomingWebhookDto {
  @ApiProperty({
    description:
      "The external event's own unique identifier, as supplied by the sender",
    example: 'evt_1a2b3c4d',
  })
  @IsString()
  @IsNotEmpty()
  event_id: string;

  @ApiPropertyOptional({
    description:
      'Open payload bag for the business data of the event. Downstream processing of this data is out of scope for signature/replay verification.',
  })
  @IsOptional()
  data?: Record<string, unknown>;
}
