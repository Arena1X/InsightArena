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

    if (await this.signatureService.isReplay(source, eventId)) {
      throw new UnauthorizedException('Duplicate webhook event');
    }

    await this.signatureService.recordProcessed(source, eventId);

    return true;
  }
}
