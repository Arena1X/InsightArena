import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

@Injectable()
export class WebhookCronService {
  private readonly logger = new Logger(WebhookCronService.name);

  constructor(private readonly dispatcherService: WebhookDispatcherService) {}

  @Cron('*/30 * * * * *')
  async processPendingDeliveries(): Promise<void> {
    try {
      await this.dispatcherService.processPendingDeliveries();
    } catch (error) {
      this.logger.error('Error processing webhook deliveries', error);
    }
  }
}
