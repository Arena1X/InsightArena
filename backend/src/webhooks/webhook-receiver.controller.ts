import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { IncomingWebhookDto } from './dto/incoming-webhook.dto';

@ApiTags('webhooks')
@Controller('webhooks/incoming')
@Public()
@UseGuards(WebhookSignatureGuard)
export class WebhookReceiverController {
  @Post(':source')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive an incoming webhook event',
    description:
      'Verifies an HMAC-SHA256 signature (X-Webhook-Signature header) against a shared ' +
      'secret and rejects replayed event_id values within the configured window. ' +
      'Downstream business processing of the payload for a specific integration is out ' +
      'of scope for this endpoint.',
  })
  @ApiParam({
    name: 'source',
    description:
      'Identifies which incoming-webhook integration this event belongs to',
  })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  @ApiResponse({
    status: 400,
    description: 'Malformed payload (e.g. missing event_id)',
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing/invalid signature, unconfigured secret, or a replayed event_id',
  })
  async receive(
    @Param('source') source: string,
    @Body() dto: IncomingWebhookDto,
  ): Promise<{ received: true }> {
    // Signature verification and replay detection already happened in
    // WebhookSignatureGuard before this handler runs. `source` and `dto`
    // are accepted here (and documented via Swagger above) so downstream
    // business processing of a specific integration's payload can be added
    // later; that processing is out of scope for this task.
    void source;
    void dto;
    return { received: true };
  }
}
