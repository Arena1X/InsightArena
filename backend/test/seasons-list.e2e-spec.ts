import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../src/notifications/notifications.service';
import { SeasonsController } from '../src/seasons/seasons.controller';
import { SeasonsService } from '../src/seasons/seasons.service';
import { Season } from '../src/seasons/entities/season.entity';
import { User } from '../src/users/entities/user.entity';
import { SorobanService } from '../src/soroban/soroban.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('GET /seasons (paginated list)', () => {
  let app: INestApplication;
  let getManyAndCount: jest.Mock;

  const winner = {
    id: 'winner-user-id',
    username: 'champ',
    stellar_address: 'GCHAMPCHAMPCHAMPCHAMPCHAMPCHAMPCHAMPCHAMP',
  } as User;

  const finalizedSeason: Season = {
    id: 'season-final',
    season_number: 10,
    name: 'Season 10',
    starts_at: new Date('2024-01-01'),
    ends_at: new Date('2024-12-31'),
    reward_pool_stroops: '999',
    is_active: false,
    is_finalized: true,
    top_winner: winner,
    on_chain_season_id: 10,
    soroban_tx_hash: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    getManyAndCount = jest.fn().mockResolvedValue([[finalizedSeason], 1]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SeasonsController],
      providers: [
        SeasonsService,
        {
          provide: getRepositoryToken(Season),
          useValue: {
            find: jest.fn(),
            exist: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getOne: jest.fn(),
              getCount: jest.fn(),
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getManyAndCount,
            }),
          },
        },
        { provide: SorobanService, useValue: { createSeason: jest.fn() } },
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
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns paginated envelope without Authorization', async () => {
    const res = await request(app.getHttpServer())
      .get('/seasons')
      .query({ page: 1, limit: 10 })
      .expect(200);

    const body = res.body as {
      success: boolean;
      data: { data: unknown[]; total: number; page: number; limit: number };
    };

    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(10);
    expect(body.data.data).toHaveLength(1);
    expect(body.data.data[0]).toMatchObject({
      season_number: 10,
      is_finalized: true,
      top_winner: {
        user_id: 'winner-user-id',
        username: 'champ',
        stellar_address: 'GCHAMPCHAMPCHAMPCHAMPCHAMPCHAMPCHAMPCHAMP',
      },
    });
    expect(getManyAndCount).toHaveBeenCalled();
  });
});
