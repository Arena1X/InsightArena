import { Test, TestingModule } from '@nestjs/testing';
import { WebhookReceiverController } from './webhook-receiver.controller';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { IncomingWebhookDto } from './dto/incoming-webhook.dto';

describe('WebhookReceiverController', () => {
  let controller: WebhookReceiverController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookReceiverController],
    })
      .overrideGuard(WebhookSignatureGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<WebhookReceiverController>(
      WebhookReceiverController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('receive', () => {
    it('acknowledges an accepted webhook once guard checks have passed', async () => {
      const dto: IncomingWebhookDto = {
        event_id: 'evt_1',
        data: { foo: 'bar' },
      };

      const result = await controller.receive('provider-x', dto);

      expect(result).toEqual({ received: true });
    });
  });
});
