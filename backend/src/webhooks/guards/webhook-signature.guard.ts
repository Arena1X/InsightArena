import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebhookSignatureService } from '../services/webhook-signature.service';

interface IncomingWebhookRequest extends Request {
  rawBody?: Buffer;
}

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private readonly signatureService: WebhookSignatureService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IncomingWebhookRequest>();

    const rawSource = request.params?.source;
    const source = Array.isArray(rawSource) ? rawSource[0] : rawSource;
    if (!source) {
      throw new BadRequestException('Missing webhook source in path');
    }

    const secret = this.signatureService.getSecret();
    if (!secret) {
      this.logger.error(
        'WEBHOOK_HMAC_SECRET is not configured; rejecting incoming webhook',
      );
      throw new UnauthorizedException(
        'Webhook signature verification is not configured',
      );
    }

    const signatureHeader = request.headers['x-webhook-signature'] as
      | string
      | undefined;

    const rawBody = request.rawBody
      ? request.rawBody.toString('utf8')
      : JSON.stringify(request.body);

    if (
      !this.signatureService.verifySignature(rawBody, signatureHeader, secret)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const eventId = (request.body as Record<string, unknown> | undefined)
      ?.event_id;
    if (!eventId || typeof eventId !== 'string') {
      throw new BadRequestException('Missing event_id');
    }

    const timestampHeader = (request.headers['x-webhook-timestamp'] ||
      request.headers['x-timestamp']) as string | undefined;
    if (timestampHeader) {
      const parsedTs = parseInt(timestampHeader, 10);
      if (isNaN(parsedTs)) {
        throw new UnauthorizedException('Invalid webhook timestamp');
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const windowSec = this.signatureService.getReplayWindowMs() / 1000;
      if (Math.abs(nowSec - parsedTs) > windowSec) {
        throw new UnauthorizedException(
          'Webhook timestamp out of allowed window',
        );
      }
    }

    if (await this.signatureService.isReplay(source, eventId)) {
      throw new UnauthorizedException('Duplicate webhook event');
    }

    await this.signatureService.recordProcessed(source, eventId);

    return true;
  }
}
