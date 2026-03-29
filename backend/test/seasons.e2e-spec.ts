import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../src/notifications/notifications.service';
import { SeasonsController } from '../src/seasons/seasons.controller';
import { SeasonsService } from '../src/seasons/seasons.service';
import { Season } from '../src/seasons/entities/season.entity';
import { SorobanService } from '../src/soroban/soroban.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

function mockSeasonsQueryBuilder(getOneResult: Season | null) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(getOneResult),
  };
}

describe('GET /seasons/active (HTTP integration)', () => {
  let app: INestApplication;

  const fullSeason: Season = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    season_number: 7,
    name: 'Season 7',
    starts_at: new Date('2020-01-01T00:00:00.000Z'),
    ends_at: new Date('2099-12-31T23:59:59.000Z'),
    reward_pool_stroops: '100000000',
    is_active: true,
    is_finalized: false,
    top_winner: null,
    on_chain_season_id: 7,
    soroban_tx_hash: 'a'.repeat(64),
    created_at: new Date('2025-01-01T00:00:00.000Z'),
    updated_at: new Date('2025-06-01T00:00:00.000Z'),
  };

  const mockDataSource = () => {
    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      manager: {
        findOne: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
      },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    return {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };
  };

  async function createApp(getOneResult: Season | null) {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SeasonsController],
      providers: [
        SeasonsService,
        {
          provide: getRepositoryToken(Season),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            exist: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest
              .fn()
              .mockReturnValue(mockSeasonsQueryBuilder(getOneResult)),
          },
        },
        { provide: SorobanService, useValue: { createSeason: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: DataSource, useFactory: mockDataSource },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const nestApp = moduleFixture.createNestApplication();
    nestApp.useGlobalInterceptors(new ResponseInterceptor());
    nestApp.useGlobalFilters(new HttpExceptionFilter());
    await nestApp.init();
    return nestApp;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns full season without Authorization (public)', async () => {
    app = await createApp(fullSeason);

    const res = await request(app.getHttpServer())
      .get('/seasons/active')
      .expect(200)
      .expect('Content-Type', /json/);

    const body = res.body as {
      success: boolean;
      data: Record<string, unknown>;
      timestamp: string;
    };

    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: fullSeason.id,
      season_number: 7,
      name: 'Season 7',
      reward_pool_stroops: '100000000',
      is_active: true,
      on_chain_season_id: 7,
      soroban_tx_hash: 'a'.repeat(64),
    });
    expect(body.data).toHaveProperty('starts_at');
    expect(body.data).toHaveProperty('ends_at');
    expect(body.data).toHaveProperty('created_at');
    expect(body.data).toHaveProperty('updated_at');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 404 with a clear message when none', async () => {
    app = await createApp(null);

    const res = await request(app.getHttpServer())
      .get('/seasons/active')
      .expect(404)
      .expect('Content-Type', /json/);

    const body = res.body as {
      success: boolean;
      error: { code: number; message: string };
    };

    expect(body.success).toBe(false);
    expect(body.error.code).toBe(404);
    expect(body.error.message).toContain('No active season exists');
    expect(body.error.message).toContain('marked active');
  });
});
