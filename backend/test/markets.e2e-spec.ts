import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Market } from '../src/markets/entities/market.entity';
import { User } from '../src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { PredictionStatsDto } from '../src/markets/dto/prediction-stats.dto';

describe('Markets (e2e)', () => {
  let app: INestApplication;
  let marketsRepository: Repository<Market>;
  let usersRepository: Repository<User>;

  const mockAdmin: User = {
    id: 'admin-123e4567-e89b-12d3-a456-426614174000',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XNZFXNRBF7XNRBF7XN',
    username: 'adminuser',
    avatar_url: '',
    total_predictions: 10,
    correct_predictions: 7,
    total_staked_stroops: '1000000',
    total_winnings_stroops: '500000',
    reputation_score: 85,
    season_points: 100,
    role: 'admin',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockUser: User = {
    id: 'user-123e4567-e89b-12d3-a456-426614174000',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XNZFXNRBF7XNRBF7XO',
    username: 'regularuser',
    avatar_url: '',
    total_predictions: 5,
    correct_predictions: 3,
    total_staked_stroops: '500000',
    total_winnings_stroops: '250000',
    reputation_score: 60,
    season_points: 50,
    role: 'user',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockMarket: Market = {
    id: 'market-123e4567-e89b-12d3-a456-426614174000',
    on_chain_market_id: 'market_123456_abc123',
    creator: mockUser,
    title: 'Will BTC reach $100k by end of year?',
    description:
      'This market predicts if Bitcoin will reach $100,000 by December 31st, 2024',
    category: 'Cryptocurrency',
    outcome_options: ['Yes', 'No'],
    end_time: new Date('2024-12-31T23:59:59Z'),
    resolution_time: new Date('2025-01-01T12:00:00Z'),
    is_public: true,
    is_resolved: false,
    resolved_outcome: null as any, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    is_cancelled: false,
    total_pool_stroops: '0',
    participant_count: 0,
    created_at: new Date('2024-01-01'),
  };

  const mockResolvedMarket: Market = {
    ...mockMarket,
    id: 'resolved-market-123e4567-e89b-12d3-a456-426614174000',
    on_chain_market_id: 'market_123456_def456',
    is_resolved: true,
    resolved_outcome: 'Yes',
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRepositoryToken(Market))
      .useValue({
        findOne: jest.fn(),
        save: jest.fn(),
      })
      .overrideProvider(getRepositoryToken(User))
      .useValue({
        findOne: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    marketsRepository = moduleFixture.get<Repository<Market>>(
      getRepositoryToken(Market),
    );
    usersRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
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

  describe('GET /markets/:id/predictions', () => {
    it('should return prediction statistics for existing market', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);

      return request(app.getHttpServer())
        .get(`/markets/${mockMarket.id}/predictions`)
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as PredictionStatsDto[];
          expect(Array.isArray(body)).toBe(true);
          expect(body).toHaveLength(2); // Two outcomes: Yes and No

          // Check structure of each prediction stat
          body.forEach((stat) => {
            expect(stat).toHaveProperty('outcome');
            expect(stat).toHaveProperty('count');
            expect(stat).toHaveProperty('total_staked_stroops');
            expect(typeof stat.outcome).toBe('string');
            expect(typeof stat.count).toBe('number');
            expect(typeof stat.total_staked_stroops).toBe('string');
          });

          // Verify outcomes match market options
          const outcomes = body.map((stat) => stat.outcome);
          expect(outcomes).toContain('Yes');
          expect(outcomes).toContain('No');

          // Verify no user data is exposed
          expect(body).not.toHaveProperty('users');
          expect(body).not.toHaveProperty('user_stakes');
          expect(body).not.toHaveProperty('stellar_addresses');
        });
    });

    it('should return 404 for non-existent market', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(null);

      return request(app.getHttpServer())
        .get('/markets/non-existent-id/predictions')
        .expect(404)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as {
            success: boolean;
            error: { code: number; message: string };
            timestamp: string;
          };

          expect(body.success).toBe(false);
          expect(body.error.code).toBe(404);
          expect(body.error.message).toContain('not found');
        });
    });

    it('should work with on-chain market ID', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);

      return request(app.getHttpServer())
        .get(`/markets/${mockMarket.on_chain_market_id}/predictions`)
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as PredictionStatsDto[];
          expect(Array.isArray(body)).toBe(true);
          expect(body).toHaveLength(2);
        });
    });

    it('should be accessible without authentication', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);

      return request(app.getHttpServer())
        .get(`/markets/${mockMarket.id}/predictions`)
        .expect(200);
    });

    it('should return proper data structure for UI charts', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);

      return request(app.getHttpServer())
        .get(`/markets/${mockMarket.id}/predictions`)
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as PredictionStatsDto[];
          expect(Array.isArray(body)).toBe(true);

          body.forEach((stat) => {
            // Verify required fields for UI charts
            expect(stat.outcome).toBeDefined();
            expect(stat.count).toBeDefined();
            expect(stat.total_staked_stroops).toBeDefined();

            // Verify data types
            expect(typeof stat.outcome).toBe('string');
            expect(typeof stat.count).toBe('number');
            expect(typeof stat.total_staked_stroops).toBe('string');

            // Verify no negative values
            expect(stat.count).toBeGreaterThanOrEqual(0);
            expect(parseInt(stat.total_staked_stroops)).toBeGreaterThanOrEqual(
              0,
            );
          });
        });
    });
  });

  describe('DELETE /markets/:id', () => {
    it('should allow admin to cancel a market', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);
      jest.spyOn(marketsRepository, 'save').mockResolvedValue({
        ...mockMarket,
        is_cancelled: true,
      });
      jest.spyOn(usersRepository, 'findOne').mockResolvedValue(mockAdmin);

      return request(app.getHttpServer())
        .delete(`/markets/${mockMarket.id}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as Market;
          expect(body.is_cancelled).toBe(true);
          expect(body.id).toBe(mockMarket.id);
        });
    });

    it('should return 404 when trying to cancel non-existent market', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(usersRepository, 'findOne').mockResolvedValue(mockAdmin);

      return request(app.getHttpServer())
        .delete('/markets/non-existent-id')
        .set('Authorization', 'Bearer admin-token')
        .expect(404)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as {
            success: boolean;
            error: { code: number; message: string };
            timestamp: string;
          };

          expect(body.success).toBe(false);
          expect(body.error.code).toBe(404);
          expect(body.error.message).toContain('not found');
        });
    });

    it('should return 409 when trying to cancel a resolved market', async () => {
      jest
        .spyOn(marketsRepository, 'findOne')
        .mockResolvedValue(mockResolvedMarket);
      jest.spyOn(usersRepository, 'findOne').mockResolvedValue(mockAdmin);

      return request(app.getHttpServer())
        .delete(`/markets/${mockResolvedMarket.id}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(409)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as {
            success: boolean;
            error: { code: number; message: string };
            timestamp: string;
          };

          expect(body.success).toBe(false);
          expect(body.error.code).toBe(409);
          expect(body.error.message).toContain(
            'Resolved markets cannot be cancelled',
          );
        });
    });

    it('should return 409 when trying to cancel an already cancelled market', async () => {
      const alreadyCancelledMarket = { ...mockMarket, is_cancelled: true };
      jest
        .spyOn(marketsRepository, 'findOne')
        .mockResolvedValue(alreadyCancelledMarket);
      jest.spyOn(usersRepository, 'findOne').mockResolvedValue(mockAdmin);

      return request(app.getHttpServer())
        .delete(`/markets/${alreadyCancelledMarket.id}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(409)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as {
            success: boolean;
            error: { code: number; message: string };
            timestamp: string;
          };

          expect(body.success).toBe(false);
          expect(body.error.code).toBe(409);
          expect(body.error.message).toContain('Market is already cancelled');
        });
    });

    it('should return 401 when non-admin tries to cancel a market', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);
      jest.spyOn(usersRepository, 'findOne').mockResolvedValue(mockUser);

      return request(app.getHttpServer())
        .delete(`/markets/${mockMarket.id}`)
        .set('Authorization', 'Bearer user-token')
        .expect(401)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as {
            success: boolean;
            error: { code: number; message: string };
            timestamp: string;
          };

          expect(body.success).toBe(false);
          expect(body.error.code).toBe(401);
        });
    });

    it('should return 401 when trying to cancel without authentication', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);

      return request(app.getHttpServer())
        .delete(`/markets/${mockMarket.id}`)
        .expect(401)
        .expect('Content-Type', /json/)
        .expect((res) => {
          const body = res.body as {
            success: boolean;
            error: { code: number; message: string };
            timestamp: string;
          };

          expect(body.success).toBe(false);
          expect(body.error.code).toBe(401);
        });
    });
  });
});
