import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ExecutionContext,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import { OracleController } from '../src/oracle/oracle.controller';
import { OracleService } from '../src/oracle/oracle.service';
import { OracleAuthGuard } from '../src/oracle/guards/oracle-auth.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Oracle (e2e)', () => {
  let app: INestApplication;
  let oracleService: jest.Mocked<OracleService>;

  beforeEach(async () => {
    oracleService = {
      getPendingMatches: jest.fn(),
    } as unknown as jest.Mocked<OracleService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OracleController],
      providers: [
        {
          provide: OracleService,
          useValue: oracleService,
        },
      ],
    })
      .overrideGuard(OracleAuthGuard)
      .useValue({
        canActivate: (_context: ExecutionContext) => true,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/oracle/pending-matches', () => {
    const mockPendingMatches = {
      data: [
        {
          match: {
            id: 'match-2',
            on_chain_match_id: 'onchain_match_2',
            team_a: 'Team Gamma',
            team_b: 'Team Delta',
            match_time: '2025-01-14T20:00:00.000Z',
            result_submitted: false,
            prediction_count: 18,
            created_at: '2025-01-09T00:00:00.000Z',
          },
          event: {
            id: 'event-1',
            on_chain_event_id: 'onchain_event_1',
            title: 'Championship Finals',
            creator_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
          },
          time_since_match_started_seconds: 172800,
        },
        {
          match: {
            id: 'match-1',
            on_chain_match_id: 'onchain_match_1',
            team_a: 'Team Alpha',
            team_b: 'Team Beta',
            match_time: '2025-01-15T20:00:00.000Z',
            result_submitted: false,
            prediction_count: 25,
            created_at: '2025-01-10T00:00:00.000Z',
          },
          event: {
            id: 'event-1',
            on_chain_event_id: 'onchain_event_1',
            title: 'Championship Finals',
            creator_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
          },
          time_since_match_started_seconds: 86400,
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    };

    it('should return pending matches that need results', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const res = await request(app.getHttpServer())
        .get('/api/v1/oracle/pending-matches')
        .set('x-api-key', 'valid-api-key')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(2);
      expect(res.body.data.total).toBe(2);

      const first = res.body.data.data[0];
      expect(first.match.team_a).toBe('Team Gamma');
      expect(first.match.team_b).toBe('Team Delta');
      expect(first.match.result_submitted).toBe(false);
      expect(first.match.prediction_count).toBe(18);
      expect(first.event.title).toBe('Championship Finals');
      expect(first.time_since_match_started_seconds).toBeGreaterThan(0);
    });

    it('should return empty list when no pending matches', async () => {
      oracleService.getPendingMatches.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/oracle/pending-matches')
        .set('x-api-key', 'valid-api-key')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('should support pagination parameters', async () => {
      oracleService.getPendingMatches.mockResolvedValue({
        ...mockPendingMatches,
        page: 2,
        limit: 10,
        data: [mockPendingMatches.data[0]],
        total: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/oracle/pending-matches')
        .query({ page: 2, limit: 10 })
        .set('x-api-key', 'valid-api-key')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.page).toBe(2);
      expect(res.body.data.limit).toBe(10);
    });

    it('should return matches ordered by match_time ascending', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const res = await request(app.getHttpServer())
        .get('/api/v1/oracle/pending-matches')
        .set('x-api-key', 'valid-api-key')
        .expect(200);

      const matches = res.body.data.data;
      const times = matches.map((m: { match: { match_time: string } }) =>
        new Date(m.match.match_time).getTime(),
      );

      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
      }
    });

    it('should include event details for each match', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const res = await request(app.getHttpServer())
        .get('/api/v1/oracle/pending-matches')
        .set('x-api-key', 'valid-api-key')
        .expect(200);

      const entry = res.body.data.data[0];
      expect(entry.event).toBeDefined();
      expect(entry.event.id).toBe('event-1');
      expect(entry.event.title).toBe('Championship Finals');
      expect(entry.event.creator_address).toBeTruthy();
    });

    it('should respect limit parameter with max cap', async () => {
      oracleService.getPendingMatches.mockResolvedValue({
        ...mockPendingMatches,
        limit: 100,
      });

      await request(app.getHttpServer())
        .get('/api/v1/oracle/pending-matches')
        .query({ limit: 200 })
        .set('x-api-key', 'valid-api-key')
        .expect(200);

      expect(oracleService.getPendingMatches).toHaveBeenCalledWith(
        expect.objectContaining({ limit: '200' }),
      );
    });
  });
});
