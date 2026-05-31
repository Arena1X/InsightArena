import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  private readonly logger = new Logger(WebhookAuthGuard.name);
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookSecret = this.configService.get<string>('WEBHOOK_SECRET') || '';
    if (!this.webhookSecret) {
      this.logger.warn('WEBHOOK_SECRET not configured in environment');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.headers['x-webhook-signature'] as string;
    const timestamp = request.headers['x-webhook-timestamp'] as string;

    // Check if webhook secret is configured
    if (!this.webhookSecret) {
      this.logger.error('Webhook secret not configured');
      throw new UnauthorizedException('Webhook authentication not configured');
    }

    // Check for required headers
    if (!signature) {
      this.logger.warn('Missing x-webhook-signature header');
      throw new UnauthorizedException('Missing signature header');
    }

    if (!timestamp) {
      this.logger.warn('Missing x-webhook-timestamp header');
      throw new UnauthorizedException('Missing timestamp header');
    }

    // Check timestamp to prevent replay attacks (5 minute window)
    const now = Math.floor(Date.now() / 1000);
    const webhookTimestamp = parseInt(timestamp, 10);
    const timeDiff = Math.abs(now - webhookTimestamp);

    if (timeDiff > 300) {
      this.logger.warn(
        `Webhook timestamp too old or in future: ${timeDiff}s difference`,
      );
      throw new UnauthorizedException('Invalid timestamp');
    }

    // Verify signature
    const body = JSON.stringify(request.body);
    const expectedSignature = this.generateSignature(body, timestamp);

    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      this.logger.warn('Signature length mismatch');
      throw new UnauthorizedException('Invalid signature');
    }

    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      this.logger.warn('Invalid webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    this.logger.debug('Webhook authentication successful');
    return true;
  }

  private generateSignature(payload: string, timestamp: string): string {
    const message = `${timestamp}.${payload}`;
    const hmac = createHmac('sha256', this.webhookSecret);
    hmac.update(message);
    return hmac.digest('hex');
  }
}
