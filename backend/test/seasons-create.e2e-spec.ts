import { Test, TestingModule } from '@nestjs/testing';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../src/notifications/notifications.service';
import { SeasonsController } from '../src/seasons/seasons.controller';
import { SeasonsService } from '../src/seasons/seasons.service';
import { Season } from '../src/seasons/entities/season.entity';
import { SorobanService } from '../src/soroban/soroban.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

function authGuard(user: 'admin' | 'user' | 'unauthenticated'): CanActivate {
  return {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<{
        headers: { authorization?: string };
        user?: { id: string; role: string };
      }>();
      if (user === 'unauthenticated') {
        throw new UnauthorizedException();
      }
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) {
        throw new UnauthorizedException();
      }
      req.user = { id: 'test-user', role: user };
      return true;
    },
  };
}

describe('POST /seasons (HTTP integration)', () => {
  const dto = {
    season_number: 5,
    start_time: '2031-01-01T00:00:00.000Z',
    end_time: '2031-12-31T23:59:59.000Z',
    reward_pool_stroops: '50000000000',
  };

  async function createApp(
    user: 'admin' | 'user' | 'unauthenticated',
    overlapActiveCount: number,
  ): Promise<INestApplication> {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(overlapActiveCount),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SeasonsController],
      providers: [
        SeasonsService,
        {
          provide: getRepositoryToken(Season),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            exist: jest.fn().mockResolvedValue(false),
            create: jest.fn((x: Partial<Season>) => ({ ...x })),
            save: jest.fn((x: Season) =>
              Promise.resolve({
                ...x,
                id: x.id ?? 'new-season-uuid',
                created_at: new Date('2026-01-15T00:00:00.000Z'),
                updated_at: new Date('2026-01-15T00:00:00.000Z'),
              }),
            ),
            remove: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(qb),
          },
        },
        {
          provide: SorobanService,
          useValue: {
            createSeason: jest.fn().mockResolvedValue({
              on_chain_season_id: 99,
              tx_hash: 'c'.repeat(64),
            }),
          },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
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
            }),
          },
        },
      ],
    }).compile();

    const app = moduleFixture.createNestApplication();
    const reflector = new Reflector();
    app.useGlobalGuards(authGuard(user), new RolesGuard(reflector));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    return app;
  }

  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns 201 and persists when admin and no overlapping active season', async () => {
    app = await createApp('admin', 0);

    const res = await request(app.getHttpServer())
      .post('/seasons')
      .set('Authorization', 'Bearer admin-token')
      .send(dto)
      .expect(201)
      .expect('Content-Type', /json/);

    const body = res.body as {
      success: boolean;
      data: Record<string, unknown>;
    };

    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      season_number: 5,
      name: 'Season 5',
      reward_pool_stroops: '50000000000',
    });
    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('starts_at');
    expect(body.data).toHaveProperty('ends_at');
  });

  it('returns 409 when an active season overlaps the new range', async () => {
    app = await createApp('admin', 1);

    const res = await request(app.getHttpServer())
      .post('/seasons')
      .set('Authorization', 'Bearer admin-token')
      .send(dto)
      .expect(409)
      .expect('Content-Type', /json/);

    const body = res.body as {
      success: boolean;
      error: { code: number; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(409);
    expect(body.error.message).toContain('active season');
    expect(body.error.message).toContain('overlaps');
  });

  it('returns 401 without Authorization', async () => {
    app = await createApp('admin', 0);

    await request(app.getHttpServer()).post('/seasons').send(dto).expect(401);
  });

  it('returns 401 when guard rejects unauthenticated caller', async () => {
    app = await createApp('unauthenticated', 0);

    await request(app.getHttpServer())
      .post('/seasons')
      .set('Authorization', 'Bearer any')
      .send(dto)
      .expect(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    app = await createApp('user', 0);

    const res = await request(app.getHttpServer())
      .post('/seasons')
      .set('Authorization', 'Bearer user-token')
      .send(dto)
      .expect(403);

    const body = res.body as { success: boolean; error: { code: number } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(403);
  });
});
