import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { Prediction } from '../src/predictions/entities/prediction.entity';
import { Market } from '../src/markets/entities/market.entity';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let usersRepository: Repository<User>;
  let predictionsRepository: Repository<Prediction>;
  let marketsRepository: Repository<Market>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XNZFXNRBF7XNRBF7XN',
    username: 'testuser',
    avatar_url: null,
    total_predictions: 10,
    correct_predictions: 7,
    total_staked_stroops: '1000000',
    total_winnings_stroops: '500000',
    reputation_score: 85,
    season_points: 100,
    role: 'user',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue({
        findOneBy: jest.fn(),
      })
      .overrideProvider(getRepositoryToken(Prediction))
      .useValue({
        createQueryBuilder: jest.fn(),
      })
      .overrideProvider(getRepositoryToken(Market))
      .useValue({
        createQueryBuilder: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    usersRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );
    predictionsRepository = moduleFixture.get<Repository<Prediction>>(
      getRepositoryToken(Prediction),
    );
    marketsRepository = moduleFixture.get<Repository<Market>>(
      getRepositoryToken(Market),
    );
    if (app) {
      await app.init();
    }
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /users/:address', () => {
    it('should return public profile for existing user', () => {
      jest.spyOn(usersRepository, 'findOneBy').mockResolvedValue(mockUser);

      return request(app.getHttpServer())
        .get(`/users/${mockUser.stellar_address}`)
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as {
            success: boolean;
            data: Record<string, unknown>;
            timestamp: string;
          };

          expect(body).toMatchObject({
            success: true,
          });
          expect(body.data).toHaveProperty('username', mockUser.username);
          expect(body.data).toHaveProperty(
            'stellar_address',
            mockUser.stellar_address,
          );
          expect(body.data).toHaveProperty(
            'reputation_score',
            mockUser.reputation_score,
          );
          expect(body.data).toHaveProperty(
            'total_predictions',
            mockUser.total_predictions,
          );
          expect(body.data).toHaveProperty(
            'correct_predictions',
            mockUser.correct_predictions,
          );
          expect(body.data).toHaveProperty('created_at');
          expect(typeof body.timestamp).toBe('string');
          expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
        });
    });

    it('should not expose internal fields in response', () => {
      jest.spyOn(usersRepository, 'findOneBy').mockResolvedValue(mockUser);

      return request(app.getHttpServer())
        .get(`/users/${mockUser.stellar_address}`)
        .expect(200)
        .expect((res: { body: { data: Record<string, unknown> } }) => {
          const data = res.body.data;

          expect(data).not.toHaveProperty('id');
          expect(data).not.toHaveProperty('role');
          expect(data).not.toHaveProperty('total_staked_stroops');
          expect(data).not.toHaveProperty('total_winnings_stroops');
          expect(data).not.toHaveProperty('season_points');
          expect(data).not.toHaveProperty('avatar_url');
          expect(data).not.toHaveProperty('updated_at');
        });
    });

    it('should return 404 for non-existent user', () => {
      jest.spyOn(usersRepository, 'findOneBy').mockResolvedValue(null);

      return request(app.getHttpServer())
        .get('/users/NONEXISTENT_ADDRESS')
        .expect(404)
        .expect('Content-Type', /json/)
        .expect(
          (res: {
            body: {
              success: boolean;
              error: { code: number; message: string };
              timestamp: string;
            };
          }) => {
            const body = res.body as {
              success: boolean;
              error: { code: number; message: string };
              timestamp: string;
            };

            expect(body).toMatchObject({
              success: false,
            });
            expect(body.error.code).toBe(404);
            expect(body.error.message).toContain('not found');
            expect(typeof body.timestamp).toBe('string');
          },
        );
    });

    it('should be accessible without authentication', () => {
      jest.spyOn(usersRepository, 'findOneBy').mockResolvedValue(mockUser);

      return request(app.getHttpServer())
        .get(`/users/${mockUser.stellar_address}`)
        .expect(200);
    });

    it('should return descriptive error message for unknown address', () => {
      jest.spyOn(usersRepository, 'findOneBy').mockResolvedValue(null);
      const unknownAddress =
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XNZFXNRBF7XNRBF7XN';

      return request(app.getHttpServer())
        .get(`/users/${unknownAddress}`)
        .expect(404)
        .expect((res: { body: { error: { message: string } } }) => {
          const message = res.body.error.message;
          expect(message).toContain(unknownAddress);
          expect(message).toContain('not found');
        });
    });
  });

  describe('GET /users/:address/predictions', () => {
    it('should return public predictions from resolved markets only', () => {
      jest.spyOn(usersRepository, 'findOneBy').mockResolvedValue(mockUser);

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      jest
        .spyOn(predictionsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as unknown as ReturnType<
            Repository<Prediction>['createQueryBuilder']
          >,
        );

      return request(app.getHttpServer())
        .get(`/users/${mockUser.stellar_address}/predictions`)
        .expect(200)
        .expect((res: { body: { data: { data: unknown[] } } }) => {
          expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            'market.is_resolved = true',
          );
          expect(res.body.data.data).toEqual([]);
        });
    });
  });

  describe('GET /users/:address/markets', () => {
    it('should return paginated markets for user address', () => {
      jest.spyOn(usersRepository, 'findOneBy').mockResolvedValue(mockUser);

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as unknown as ReturnType<
            Repository<Market>['createQueryBuilder']
          >,
        );

      return request(app.getHttpServer())
        .get(`/users/${mockUser.stellar_address}/markets`)
        .expect(200)
        .expect(
          (res: { body: { data: { data: unknown[]; total: number } } }) => {
            expect(queryBuilder.where).toHaveBeenCalledWith(
              'market.creatorId = :userId',
              { userId: mockUser.id },
            );
            expect(res.body.data.data).toEqual([]);
            expect(res.body.data.total).toBe(0);
          },
        );
    });

    it('should apply status=active filter query', () => {
      jest.spyOn(usersRepository, 'findOneBy').mockResolvedValue(mockUser);

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      return request(app.getHttpServer())
        .get(`/users/${mockUser.stellar_address}/markets`)
        .query({ status: 'active' })
        .expect(200)
        .expect(() => {
          expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            'market.is_resolved = false AND market.is_cancelled = false',
          );
        });
    });

    it('should be accessible without authentication', () => {
      jest.spyOn(usersRepository, 'findOneBy').mockResolvedValue(mockUser);
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      return request(app.getHttpServer())
        .get(`/users/${mockUser.stellar_address}/markets`)
        .expect(200);
    });
  });
});
