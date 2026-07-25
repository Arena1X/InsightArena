import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookDeliveryLog } from './entities/webhook-delivery-log.entity';
import { WebhookProcessedEvent } from './entities/webhook-processed-event.entity';
import { WebhooksService } from './services/webhooks.service';
import { WebhookDispatcherService } from './services/webhook-dispatcher.service';
import { WebhookCronService } from './services/webhook-cron.service';
import { WebhookSignatureService } from './services/webhook-signature.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookReceiverController } from './webhook-receiver.controller';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebhookEndpoint,
      WebhookDeliveryLog,
      WebhookProcessedEvent,
    ]),
    HttpModule,
  ],
  controllers: [WebhooksController, WebhookReceiverController],
  providers: [
    WebhooksService,
    WebhookDispatcherService,
    WebhookCronService,
    WebhookSignatureService,
    WebhookSignatureGuard,
  ],
  exports: [WebhookDispatcherService],
})
export class WebhooksModule {}
