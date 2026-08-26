import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './services/webhooks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { DeliveryStatus } from './entities/webhook-delivery-log.entity';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhooksService: jest.Mocked<
    Pick<WebhooksService, 'listDeadLetterDeliveries' | 'redriveDelivery'>
  >;

  beforeEach(async () => {
    webhooksService = {
      listDeadLetterDeliveries: jest.fn(),
      redriveDelivery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: WebhooksService, useValue: webhooksService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  describe('listDeadLetterDeliveries', () => {
    it('requires the Admin role', () => {
      const reflector = new Reflector();
      const roles = reflector.get<Role[]>(
        ROLES_KEY,
        controller.listDeadLetterDeliveries,
      );
      expect(roles).toEqual([Role.Admin]);
    });

    it('delegates to the service with parsed pagination', async () => {
      webhooksService.listDeadLetterDeliveries.mockResolvedValue({
        logs: [],
        total: 0,
      });

      await controller.listDeadLetterDeliveries('10', '20');

      expect(webhooksService.listDeadLetterDeliveries).toHaveBeenCalledWith(
        10,
        20,
      );
    });

    it('defaults and caps pagination', async () => {
      webhooksService.listDeadLetterDeliveries.mockResolvedValue({
        logs: [],
        total: 0,
      });

      await controller.listDeadLetterDeliveries('500', undefined);

      expect(webhooksService.listDeadLetterDeliveries).toHaveBeenCalledWith(
        100,
        0,
      );
    });
  });

  describe('redriveDelivery', () => {
    it('requires the Admin role', () => {
      const reflector = new Reflector();
      const roles = reflector.get<Role[]>(
        ROLES_KEY,
        controller.redriveDelivery,
      );
      expect(roles).toEqual([Role.Admin]);
    });

    it('delegates to the service', async () => {
      const redriven = { id: 'x', status: DeliveryStatus.PENDING } as any;
      webhooksService.redriveDelivery.mockResolvedValue(redriven);

      const result = await controller.redriveDelivery('x');

      expect(webhooksService.redriveDelivery).toHaveBeenCalledWith('x');
      expect(result).toBe(redriven);
    });
  });
});
