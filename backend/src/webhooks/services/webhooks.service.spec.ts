import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import {
  DeliveryStatus,
  WebhookDeliveryLog,
} from '../entities/webhook-delivery-log.entity';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let deliveryLogRepository: jest.Mocked<
    Pick<Repository<WebhookDeliveryLog>, 'findAndCount' | 'findOne' | 'save'>
  >;
  let endpointRepository: jest.Mocked<Pick<Repository<WebhookEndpoint>, never>>;

  beforeEach(async () => {
    deliveryLogRepository = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };
    endpointRepository = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: getRepositoryToken(WebhookEndpoint),
          useValue: endpointRepository,
        },
        {
          provide: getRepositoryToken(WebhookDeliveryLog),
          useValue: deliveryLogRepository,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  describe('listDeadLetterDeliveries', () => {
    it('returns dead-lettered deliveries with pagination', async () => {
      const logs = [
        { id: 'a', status: DeliveryStatus.DEAD_LETTER },
      ] as WebhookDeliveryLog[];
      deliveryLogRepository.findAndCount.mockResolvedValue([logs, 1]);

      const result = await service.listDeadLetterDeliveries(25, 5);

      expect(deliveryLogRepository.findAndCount).toHaveBeenCalledWith({
        where: { status: DeliveryStatus.DEAD_LETTER },
        relations: ['endpoint'],
        order: { created_at: 'DESC' },
        take: 25,
        skip: 5,
      });
      expect(result).toEqual({ logs, total: 1 });
    });
  });

  describe('redriveDelivery', () => {
    it('throws NotFoundException when the delivery does not exist', async () => {
      deliveryLogRepository.findOne.mockResolvedValue(null);

      await expect(service.redriveDelivery('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects redriving a delivery that is not dead-lettered', async () => {
      deliveryLogRepository.findOne.mockResolvedValue({
        id: 'x',
        status: DeliveryStatus.PENDING,
      } as WebhookDeliveryLog);

      await expect(service.redriveDelivery('x')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('resets a dead-lettered delivery to pending with a fresh attempt budget', async () => {
      const log = {
        id: 'x',
        status: DeliveryStatus.DEAD_LETTER,
        attempt_count: 5,
        next_retry_at: null,
        error_message: 'boom',
      } as WebhookDeliveryLog;
      deliveryLogRepository.findOne.mockResolvedValue(log);
      deliveryLogRepository.save.mockImplementation(
        async (l) => l as WebhookDeliveryLog,
      );

      const result = await service.redriveDelivery('x');

      expect(result.status).toBe(DeliveryStatus.PENDING);
      expect(result.attempt_count).toBe(0);
      expect(result.next_retry_at).toBeInstanceOf(Date);
      expect(deliveryLogRepository.save).toHaveBeenCalledWith(log);
    });
  });
});
