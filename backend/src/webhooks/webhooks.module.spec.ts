import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request, { SuperTest, Test as SuperTestRequest } from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './services/webhooks.service';
import { ApiKey } from '../auth/entities/api-key.entity';
import { ApiKeyService } from '../auth/api-key.service';

describe('WebhooksController — API key scope enforcement', () => {
  let app: INestApplication;
  let server: SuperTest<SuperTestRequest>;
  let apiKeyService: { validateKey: jest.Mock; touchLastUsed: jest.Mock };

  const webhooksService = {
    createEndpoint: jest.fn().mockResolvedValue({ id: 'ep-1' }),
    listEndpoints: jest.fn().mockResolvedValue([]),
    findEndpointById: jest.fn(),
    updateEndpoint: jest.fn(),
    deleteEndpoint: jest.fn(),
    getDeliveryLogs: jest.fn(),
    listDeadLetterDeliveries: jest.fn(),
    redriveDelivery: jest.fn(),
  };

  const makeKey = (scopes: string[]) =>
    ({
      id: 'key-1',
      user: { id: 'user-1' },
      scopes,
    }) as ApiKey;

  beforeAll(async () => {
    apiKeyService = { validateKey: jest.fn(), touchLastUsed: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: webhooksService },
        { provide: ApiKeyService, useValue: apiKeyService },
        { provide: getRepositoryToken(ApiKey), useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    server = request(httpServer);
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await app.close();
  });

  it('allows a request when the key has the required scope', async () => {
    apiKeyService.validateKey.mockResolvedValue(makeKey(['webhooks:write']));

    await server
      .post('/webhooks/endpoints')
      .set('X-API-Key', 'ia_validkey123')
      .expect(201);

    expect(webhooksService.createEndpoint).toHaveBeenCalled();
  });

  it('rejects with 403 and the missing scope when the key lacks it', async () => {
    apiKeyService.validateKey.mockResolvedValue(makeKey(['markets:read']));

    const res = await server
      .post('/webhooks/endpoints')
      .set('X-API-Key', 'ia_validkey123')
      .expect(403);

    expect(res.body.message).toContain('webhooks:write');
    expect(webhooksService.createEndpoint).not.toHaveBeenCalled();
  });
});
