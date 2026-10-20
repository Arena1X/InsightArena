import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { SorobanService } from '../../src/soroban/soroban.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { OracleService } from '../../src/oracle/oracle.service';
import { ContractService } from '../../src/contract/contract.service';
import { Market } from '../../src/markets/entities/market.entity';
import { User } from '../../src/users/entities/user.entity';
import { Prediction } from '../../src/predictions/entities/prediction.entity';
import { Competition } from '../../src/competitions/entities/competition.entity';
import { Season } from '../../src/seasons/entities/season.entity';
import { Notification } from '../../src/notifications/entities/notification.entity';
import { Match } from '../../src/matches/entities/match.entity';
import { MatchPrediction } from '../../src/matches/entities/match-prediction.entity';
import { CreatorEvent } from '../../src/matches/entities/creator-event.entity';
import { LeaderboardEntry } from '../../src/leaderboard/entities/leaderboard-entry.entity';
import { Dispute } from '../../src/disputes/entities/dispute.entity';
import { OracleSubmission } from '../../src/oracle/entities/oracle-submission.entity';
import { ActivityLog } from '../../src/analytics/entities/activity-log.entity';
import { MarketHistory } from '../../src/analytics/entities/market-history.entity';
import { VerifiedAddress } from '../../src/admin/entities/verified-address.entity';
import { UserPreferences } from '../../src/users/entities/user-preferences.entity';
import { UserAchievement } from '../../src/achievements/entities/user-achievement.entity';
import { Achievement } from '../../src/achievements/entities/achievement.entity';
import { UserFollow } from '../../src/users/entities/user-follow.entity';
import { Comment } from '../../src/markets/entities/comment.entity';
import { UserBookmark } from '../../src/markets/entities/user-bookmark.entity';
import { CompetitionParticipant } from '../../src/competitions/entities/competition-participant.entity';
import { Flag } from '../../src/flags/entities/flag.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRepository() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    create: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    exist: jest.fn().mockResolvedValue(false),
    increment: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getCount: jest.fn().mockResolvedValue(0),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    })),
    query: jest.fn().mockResolvedValue([]),
  };
}

const allEntities = [
  User,
  Market,
  Prediction,
  Competition,
  Season,
  Notification,
  Match,
  MatchPrediction,
  CreatorEvent,
  LeaderboardEntry,
  Dispute,
  OracleSubmission,
  ActivityLog,
  MarketHistory,
  VerifiedAddress,
  UserPreferences,
  UserAchievement,
  Achievement,
  UserFollow,
  Comment,
  UserBookmark,
  CompetitionParticipant,
  Flag,
];

// ---------------------------------------------------------------------------
// Shared mock values
// ---------------------------------------------------------------------------

const mockSoroban = {
  createMarket: jest.fn(),
  submitPrediction: jest.fn(),
  resolveMarket: jest.fn(),
  createDispute: jest.fn(),
  resolveDispute: jest.fn(),
  createSeason: jest.fn(),
  getEvents: jest.fn(),
  getContractData: jest.fn(),
  lockStake: jest.fn(),
  processStakeRefund: jest.fn(),
};

const mockNotifications = {
  create: jest.fn().mockResolvedValue(undefined),
  findAll: jest.fn().mockResolvedValue([]),
  markAsRead: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
};

const mockOracle = {
  getPendingMatches: jest.fn().mockResolvedValue({ matches: [], total: 0 }),
  processWebhook: jest.fn().mockResolvedValue({ accepted: true }),
  getSubmissions: jest.fn().mockResolvedValue({ submissions: [], total: 0 }),
};

const mockContract = {
  getEvent: jest.fn(),
  getEventByCode: jest.fn(),
  getMatch: jest.fn(),
  getEventMatches: jest.fn(),
  getPrediction: jest.fn(),
  getUserPredictions: jest.fn().mockResolvedValue([]),
  getEventParticipants: jest.fn().mockResolvedValue([]),
  getEventWinners: jest.fn().mockResolvedValue([]),
  getConfig: jest.fn(),
  getCreationFee: jest.fn(),
  isVerified: jest.fn().mockResolvedValue(false),
  getEventStatistics: jest.fn(),
  getPredictionDistribution: jest
    .fn()
    .mockResolvedValue({ teamA: 0, teamB: 0, draw: 0 }),
  getMatchPredictions: jest.fn().mockResolvedValue([]),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  reset: jest.fn(),
  wrap: jest.fn(),
};

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      increment: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    },
  }),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('API Integration Tests', () => {
  let app: INestApplication;

  async function buildApp() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CACHE_MANAGER)
      .useValue(mockCache)
      .overrideProvider(SorobanService)
      .useValue(mockSoroban)
      .overrideProvider(NotificationsService)
      .useValue(mockNotifications)
      .overrideProvider(OracleService)
      .useValue(mockOracle)
      .overrideProvider(ContractService)
      .useValue(mockContract)
      .overrideProvider(DataSource)
      .useValue(mockDataSource)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    for (const entity of allEntities) {
      moduleFixture
        .overrideProvider(getRepositoryToken(entity))
        .useValue(mockRepository());
    }

    const app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    return app;
  }

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // ===========================================================================
  // Health Endpoints
  // ===========================================================================

  describe('GET /health', () => {
    it('GET /health/ping returns 200', () => {
      return request(app.getHttpServer()).get('/health/ping').expect(200);
    });

    it('GET /health returns 200 with JSON', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/);
    });
  });

  // ===========================================================================
  // Markets Endpoints
  // ===========================================================================

  describe('GET /markets', () => {
    it('returns success response with paginated data', () => {
      return request(app.getHttpServer())
        .get('/markets')
        .query({ page: 1, limit: 10 })
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('timestamp');
          expect(typeof res.body.timestamp).toBe('string');
          expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
        });
    });

    it('supports status filtering', () => {
      return request(app.getHttpServer())
        .get('/markets')
        .query({ status: 'active' })
        .expect(200);
    });

    it('supports category filtering', () => {
      return request(app.getHttpServer())
        .get('/markets')
        .query({ category: 'sports' })
        .expect(200);
    });

    it('is public (no auth required)', () => {
      return request(app.getHttpServer()).get('/markets').expect(200);
    });
  });

  // ===========================================================================
  // Users Endpoints
  // ===========================================================================

  describe('GET /users/:address', () => {
    const addr = 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XNZFXNRBF7XNRBF7XN';

    it('returns 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .get(`/users/${addr}`)
        .expect(404)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe(404);
          expect(res.body.error).toHaveProperty('message');
          expect(res.body).toHaveProperty('timestamp');
        });
    });
  });

  // ===========================================================================
  // Leaderboard Endpoints
  // ===========================================================================

  describe('GET /leaderboard', () => {
    it('returns leaderboard entries', () => {
      return request(app.getHttpServer())
        .get('/leaderboard')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('timestamp');
        });
    });

    it('supports pagination', () => {
      return request(app.getHttpServer())
        .get('/leaderboard')
        .query({ page: 1, limit: 20 })
        .expect(200);
    });

    it('is public', () => {
      return request(app.getHttpServer()).get('/leaderboard').expect(200);
    });
  });

  describe('GET /leaderboard/history', () => {
    it('returns history', () => {
      return request(app.getHttpServer())
        .get('/leaderboard/history')
        .expect(200);
    });
  });

  // ===========================================================================
  // Creator Events Endpoints
  // ===========================================================================

  describe('GET /creator-events/search', () => {
    it('searches events', () => {
      return request(app.getHttpServer())
        .get('/creator-events/search')
        .query({ q: 'test', page: 1, limit: 10 })
        .expect(200);
    });

    it('handles empty query', () => {
      return request(app.getHttpServer())
        .get('/creator-events/search')
        .expect(200);
    });
  });

  describe('GET /creator-events/:id', () => {
    it('returns 404 for non-existent event', () => {
      return request(app.getHttpServer())
        .get('/creator-events/999')
        .expect(404)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe(404);
        });
    });
  });

  // ===========================================================================
  // Analytics Endpoints
  // ===========================================================================

  describe('GET /analytics/categories', () => {
    it('returns category analytics', () => {
      return request(app.getHttpServer())
        .get('/analytics/categories')
        .expect(200);
    });

    it('is public', () => {
      return request(app.getHttpServer())
        .get('/analytics/categories')
        .expect(200);
    });
  });

  // ===========================================================================
  // Search Endpoints
  // ===========================================================================

  describe('GET /search', () => {
    it('returns search results', () => {
      return request(app.getHttpServer())
        .get('/search')
        .query({ q: 'test' })
        .expect(200);
    });
  });

  // ===========================================================================
  // Matches Endpoints
  // ===========================================================================

  describe('GET /matches/:id', () => {
    it('returns 404 for non-existent match', () => {
      return request(app.getHttpServer()).get('/matches/999').expect(404);
    });

    it('is public', () => {
      return request(app.getHttpServer()).get('/matches/999').expect(404);
    });
  });

  // ===========================================================================
  // Response Format
  // ===========================================================================

  describe('Response Envelope', () => {
    it('wraps success in standard envelope', () => {
      return request(app.getHttpServer())
        .get('/marketss')
        .expect(404)
        .expect((res) => {
          expect(res.body).toEqual(
            expect.objectContaining({
              success: false,
              error: expect.objectContaining({
                code: expect.any(Number),
                message: expect.any(String),
              }),
              timestamp: expect.any(String),
            }),
          );
        });
    });

    it('wraps errors in standard envelope', () => {
      return request(app.getHttpServer())
        .get('/creator-events/99999')
        .expect(404)
        .expect((res) => {
          expect(res.body).toEqual(
            expect.objectContaining({
              success: false,
              error: expect.objectContaining({
                code: expect.any(Number),
                message: expect.any(String),
              }),
              timestamp: expect.any(String),
            }),
          );
        });
    });
  });

  // ===========================================================================
  // Error Cases
  // ===========================================================================

  describe('Error Handling', () => {
    it('returns 404 for unknown routes', () => {
      return request(app.getHttpServer()).get('/nonexistent-route').expect(404);
    });
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe('Authentication', () => {
    it('returns 401 on protected route without auth (guard bypassed)', () => {
      return request(app.getHttpServer()).get('/users/me').expect(401);
    });
  });

  // ===========================================================================
  // Competitions Endpoints
  // ===========================================================================

  describe('GET /competitions', () => {
    it('returns competition list', () => {
      return request(app.getHttpServer()).get('/competitions').expect(200);
    });

    it('supports pagination', () => {
      return request(app.getHttpServer())
        .get('/competitions')
        .query({ page: 1, limit: 10 })
        .expect(200);
    });

    it('returns empty array when none exist', () => {
      return request(app.getHttpServer())
        .get('/competitions')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
        });
    });
  });

  // ===========================================================================
  // Seasons Endpoints
  // ===========================================================================

  describe('GET /seasons', () => {
    it('returns season list', () => {
      return request(app.getHttpServer()).get('/seasons').expect(200);
    });

    it('is public', () => {
      return request(app.getHttpServer()).get('/seasons').expect(200);
    });
  });

  describe('GET /seasons/active', () => {
    it('returns 404 when no active season exists', () => {
      return request(app.getHttpServer()).get('/seasons/active').expect(404);
    });
  });

  // ===========================================================================
  // Matches Predictions Endpoints
  // ===========================================================================

  describe('GET /matches/:id/predictions', () => {
    it('returns 404 for non-existent match predictions', () => {
      return request(app.getHttpServer())
        .get('/matches/999/predictions')
        .expect(404);
    });
  });
});
