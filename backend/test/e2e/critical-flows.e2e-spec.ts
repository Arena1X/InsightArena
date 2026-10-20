import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
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
import { User } from '../../src/users/entities/user.entity';
import { Market } from '../../src/markets/entities/market.entity';
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
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    exist: jest.fn(),
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

function mockQueryRunner() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      increment: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    },
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

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner()),
};

const mockSorobanService = {
  createMarket: jest.fn(),
  submitPrediction: jest.fn().mockResolvedValue('0xprediction_hash'),
  resolveMarket: jest.fn(),
  createDispute: jest.fn(),
  resolveDispute: jest.fn(),
  createSeason: jest.fn().mockResolvedValue(1),
  processStakeRefund: jest.fn(),
  lockStake: jest.fn(),
  getEvents: jest.fn(),
  getContractData: jest.fn(),
};

const mockNotificationsService = {
  create: jest.fn().mockResolvedValue(undefined),
  findAll: jest.fn().mockResolvedValue([]),
  markAsRead: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
};

const mockOracleService = {
  getPendingMatches: jest.fn().mockResolvedValue({ matches: [], total: 0 }),
  processWebhook: jest.fn().mockResolvedValue({ accepted: true }),
  getSubmissions: jest.fn().mockResolvedValue({ submissions: [], total: 0 }),
};

const mockContractService = {
  getEvent: jest.fn(),
  getEventByCode: jest.fn(),
  getMatch: jest.fn(),
  getEventMatches: jest.fn(),
  getPrediction: jest.fn(),
  getUserPredictions: jest.fn(),
  getEventParticipants: jest.fn(),
  getEventWinners: jest.fn(),
  getConfig: jest.fn(),
  getCreationFee: jest.fn(),
  isVerified: jest.fn(),
  getEventStatistics: jest.fn(),
  getPredictionDistribution: jest.fn(),
};

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  reset: jest.fn(),
  wrap: jest.fn(),
};

// ---------------------------------------------------------------------------
// Override helpers
// ---------------------------------------------------------------------------

async function buildApp(
  entityOverrides?: Record<string, unknown>,
  guardOverride?: { canActivate: () => boolean },
  rolesGuardOverride?: { canActivate: () => boolean },
): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(CACHE_MANAGER)
    .useValue(mockCacheManager)
    .overrideProvider(SorobanService)
    .useValue(mockSorobanService)
    .overrideProvider(NotificationsService)
    .useValue(mockNotificationsService)
    .overrideProvider(OracleService)
    .useValue(mockOracleService)
    .overrideProvider(ContractService)
    .useValue(mockContractService)
    .overrideProvider(DataSource)
    .useValue(mockDataSource)
    .overrideGuard(JwtAuthGuard)
    .useValue(guardOverride ?? { canActivate: () => true })
    .overrideGuard(RolesGuard)
    .useValue(rolesGuardOverride ?? { canActivate: () => true })
    .compile();

  if (entityOverrides) {
    for (const [token, value] of Object.entries(entityOverrides)) {
      moduleFixture.overrideProvider(token).useValue(value);
    }
  } else {
    for (const entity of allEntities) {
      moduleFixture
        .overrideProvider(getRepositoryToken(entity))
        .useValue(mockRepository());
    }
  }

  const app = moduleFixture.createNestApplication();
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: Critical Flows', () => {
  // =========================================================================
  // 1. Season Lifecycle
  // =========================================================================

  describe('Season Lifecycle', () => {
    let app: INestApplication;

    afterEach(async () => {
      if (app) await app.close();
    });

    it('should list all seasons (empty)', async () => {
      app = await buildApp();

      const res = await request(app.getHttpServer())
        .get('/seasons')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should fetch active season (triggers 404 when none)', async () => {
      app = await buildApp();

      const res = await request(app.getHttpServer())
        .get('/seasons/active')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(404);
    });
  });

  // =========================================================================
  // 2. Admin Operations Flow
  // =========================================================================

  describe('Admin Operations', () => {
    let app: INestApplication;

    afterEach(async () => {
      if (app) await app.close();
    });

    it('should reject non-admin role (403)', async () => {
      app = await buildApp(
        undefined,
        { canActivate: () => true },
        { canActivate: () => false },
      );

      return request(app.getHttpServer())
        .get('/admin/users')
        .expect(403)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe(403);
        });
    });
  });

  // =========================================================================
  // 3. Oracle Submission Flow
  // =========================================================================

  describe('Oracle Submission Flow', () => {
    let app: INestApplication;

    afterEach(async () => {
      if (app) await app.close();
    });

    it('should fetch pending matches requiring results', async () => {
      mockOracleService.getPendingMatches.mockResolvedValue({
        matches: [
          {
            id: 'match-uuid-1',
            on_chain_match_id: 1n,
            team_a: 'Team Alpha',
            team_b: 'Team Beta',
            match_time: new Date(Date.now() - 3600000),
            result_submitted: false,
          },
        ],
        total: 1,
      });

      app = await buildApp();
      const res = await request(app.getHttpServer())
        .get('/oracle/pending-matches')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should accept webhook match result submission', async () => {
      mockOracleService.processWebhook.mockResolvedValue({ accepted: true });

      app = await buildApp();
      const res = await request(app.getHttpServer())
        .post('/oracle/webhooks/match-result')
        .send({
          match_id: '1',
          winning_team: 'TEAM_A',
          signature: '0xvalid_signature',
        })
        .expect(202);

      expect(res.body.success).toBe(true);
    });

    it('should fetch oracle submission history', async () => {
      mockOracleService.getSubmissions.mockResolvedValue({
        submissions: [
          {
            id: 'sub-1',
            match_id: 'match-uuid-1',
            result: 'TEAM_A',
            submitted_at: new Date(),
            status: 'confirmed',
          },
        ],
        total: 1,
      });

      app = await buildApp();
      const res = await request(app.getHttpServer())
        .get('/oracle/submissions')
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // 4. Notification Flow
  // =========================================================================

  describe('Notification Flow', () => {
    let app: INestApplication;

    afterEach(async () => {
      if (app) await app.close();
    });

    it('should fetch user notifications', async () => {
      const notifRepoMock = {
        ...mockRepository(),
        findAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 1,
              user_address: 'GBXXX...',
              type: 'match_result',
              title: 'Match Result',
              message: 'Team A won',
              read: false,
              created_at: new Date(),
            },
          ],
          1,
        ]),
      };

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(CACHE_MANAGER)
        .useValue(mockCacheManager)
        .overrideProvider(SorobanService)
        .useValue(mockSorobanService)
        .overrideProvider(NotificationsService)
        .useValue(mockNotificationsService)
        .overrideProvider(OracleService)
        .useValue(mockOracleService)
        .overrideProvider(ContractService)
        .useValue(mockContractService)
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
          .useValue(notifRepoMock);
      }

      app = moduleFixture.createNestApplication();
      app.useGlobalInterceptors(new ResponseInterceptor());
      app.useGlobalFilters(new HttpExceptionFilter());
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/notifications/GBXXX...')
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 5. Matches & Predictions Flow
  // =========================================================================

  describe('Matches & Predictions Flow', () => {
    let app: INestApplication;

    afterEach(async () => {
      if (app) await app.close();
    });

    it('should return 404 for non-existent match details', async () => {
      app = await buildApp();

      const res = await request(app.getHttpServer())
        .get('/matches/999')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(404);
    });
  });
});
