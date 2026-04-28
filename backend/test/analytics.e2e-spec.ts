import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';
import { Prediction } from '../src/predictions/entities/prediction.entity';
import { LeaderboardEntry } from '../src/leaderboard/entities/leaderboard-entry.entity';
import { Market } from '../src/markets/entities/market.entity';

function mockQueryBuilder(terminal: {
  getCount?: number;
  getMany?: Prediction[];
}) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(terminal.getCount ?? 0),
    getMany: jest.fn().mockResolvedValue(terminal.getMany ?? []),
  };
}

describe('Analytics dashboard (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let usersRepository: {
    findOneBy: jest.Mock;
    findOne: jest.Mock;
  };
  let predictionsRepository: {
    createQueryBuilder: jest.Mock;
  };
  let leaderboardRepository: {
    createQueryBuilder: jest.Mock;
  };

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XNZFXNRBF7XNRBF7XN',
    username: 'dashuser',
    avatar_url: null,
    total_predictions: 128,
    correct_predictions: 88,
    total_staked_stroops: '1000000',
    total_winnings_stroops: '1240000000',
    reputation_score: 840,
    season_points: 10,
    role: 'user',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    usersRepository = {
      findOneBy: jest.fn((where: { id: string }) =>
        where.id === mockUser.id ? mockUser : null,
      ),
      findOne: jest.fn((opts: { where: { id: string } }) =>
        opts.where.id === mockUser.id ? mockUser : null,
      ),
    };

    const market = {
      is_resolved: true,
      is_cancelled: false,
      resolved_outcome: 'Yes',
      resolution_time: new Date('2025-06-01'),
    } as Market;

    const streakPreds = Array.from({ length: 4 }, () => ({
      chosen_outcome: 'Yes',
      market,
    })) as Prediction[];

    let qbInvocation = 0;
    predictionsRepository = {
      createQueryBuilder: jest.fn(() => {
        qbInvocation += 1;
        if (qbInvocation === 1) return mockQueryBuilder({ getCount: 5 });
        return mockQueryBuilder({ getMany: streakPreds });
      }),
    };

    leaderboardRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'lb-1',
          user_id: mockUser.id,
          season_id: null,
          rank: 24,
          reputation_score: 840,
          updated_at: new Date('2025-06-02'),
        } as LeaderboardEntry),
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(usersRepository)
      .overrideProvider(getRepositoryToken(Prediction))
      .useValue(predictionsRepository)
      .overrideProvider(getRepositoryToken(LeaderboardEntry))
      .useValue(leaderboardRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /analytics/dashboard returns aggregated KPIs with JWT', async () => {
    const access_token = await jwtService.signAsync({
      sub: mockUser.id,
      stellar_address: mockUser.stellar_address,
    });

    const expectedAccuracy = ((88 / 128) * 100).toFixed(1);

    await request(app.getHttpServer())
      .get('/analytics/dashboard')
      .set('Authorization', `Bearer ${access_token}`)
      .expect(200)
      .expect('Content-Type', /json/)
      .expect((res) => {
        const body = res.body as {
          success: boolean;
          data: Record<string, unknown>;
          timestamp: string;
        };

        expect(body.success).toBe(true);
        expect(body.data).toEqual({
          total_predictions: 128,
          accuracy_rate: expectedAccuracy,
          current_rank: 24,
          total_rewards_earned_stroops: '1240000000',
          active_predictions_count: 5,
          current_streak: 4,
          reputation_score: 840,
          tier: 'Gold Predictor',
        });
        expect(typeof body.timestamp).toBe('string');
      });

    expect(leaderboardRepository.createQueryBuilder).toHaveBeenCalledWith(
      'entry',
    );
  });

  it('GET /analytics/dashboard returns 401 without Authorization', async () => {
    await request(app.getHttpServer()).get('/analytics/dashboard').expect(401);
  });
});
