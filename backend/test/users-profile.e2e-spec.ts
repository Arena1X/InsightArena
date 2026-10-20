import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { User } from '../src/users/entities/user.entity';
import { UserPreferences } from '../src/users/entities/user-preferences.entity';
import { UserFollow } from '../src/users/entities/user-follow.entity';
import { Prediction } from '../src/predictions/entities/prediction.entity';
import { Market } from '../src/markets/entities/market.entity';
import { Notification } from '../src/notifications/entities/notification.entity';
import { CompetitionParticipant } from '../src/competitions/entities/competition-participant.entity';
import { UserBookmark } from '../src/markets/entities/user-bookmark.entity';
import { UserReferral } from '../src/users/entities/user-referral.entity';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('PATCH /users/me (profile update)', () => {
  let app: INestApplication;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XNZFXNRBF7XNRBF7XN',
    username: 'profile_user',
    avatar_url: 'https://example.com/original.png',
    total_predictions: 0,
    correct_predictions: 0,
    total_staked_stroops: '0',
    total_winnings_stroops: '0',
    reputation_score: 0,
    season_points: 0,
    role: 'user',
    is_banned: false,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  } as User;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOneBy: jest.fn().mockResolvedValue(mockUser),
            findOne: jest.fn(),
            save: jest
              .fn()
              .mockImplementation((user: User) => Promise.resolve(user)),
          },
        },
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: { findOneBy: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserFollow),
          useValue: { findOne: jest.fn(), save: jest.fn(), remove: jest.fn() },
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: { find: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Market),
          useValue: { find: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(CompetitionParticipant),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserBookmark),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserReferral),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user: User } };
        }) => {
          const req = context.switchToHttp().getRequest();
          req.user = mockUser;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });
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

  it('rejects unknown profile fields', async () => {
    await request(app.getHttpServer())
      .patch('/users/me')
      .send({ username: 'valid_name', reputation_score: 999 })
      .expect(400);
  });

  it('preserves untouched fields on partial update', async () => {
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .send({ username: 'updated_name' })
      .expect(200);

    const body = res.body as {
      success: boolean;
      data: { username: string; avatar_url: string };
    };

    expect(body.success).toBe(true);
    expect(body.data.username).toBe('updated_name');
    expect(body.data.avatar_url).toBe('https://example.com/original.png');
  });
});
