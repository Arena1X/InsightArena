import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ExecutionContext,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import {
  CreatorEventsController,
  PublicCreatorEventsController,
} from '../src/creator-events/creator-events.controller';
import { CreatorEventsService } from '../src/creator-events/creator-events.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('CreatorEvents (e2e)', () => {
  let app: INestApplication;
  let creatorEventsService: jest.Mocked<CreatorEventsService>;

  const mockEvent = {
    id: 'event-123',
    on_chain_event_id: '1',
    title: 'Test Event',
    description: 'A test event description',
    creator_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
    is_active: true,
    is_cancelled: false,
    participant_count: 10,
    match_count: 5,
    winners_verified: false,
    max_participants: 100,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
  };

  const mockEnrichedEvent = {
    ...mockEvent,
    matchCount: 5,
    matchPreview: [
      {
        id: 'm1',
        team_a: 'Team A',
        team_b: 'Team B',
        match_time: '2025-02-01T00:00:00.000Z',
      },
    ],
    winnerCount: 3,
    creatorVerified: true,
  };

  beforeEach(async () => {
    creatorEventsService = {
      searchEvents: jest.fn(),
      getEventById: jest.fn(),
      getParticipants: jest.fn(),
      getEventMatches: jest.fn(),
      getEventStats: jest.fn(),
      getUserPredictionsForEvent: jest.fn(),
      getUserScore: jest.fn(),
      getEventByInviteCode: jest.fn(),
    } as unknown as jest.Mocked<CreatorEventsService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CreatorEventsController, PublicCreatorEventsController],
      providers: [
        {
          provide: CreatorEventsService,
          useValue: creatorEventsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            id: 'test-user-id',
            stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
            role: 'user',
          };
          return true;
        },
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

  describe('GET /api/v1/creator-events/search', () => {
    const searchResponse = {
      data: [
        {
          id: 'event-123',
          on_chain_event_id: 1,
          title: 'Test Event',
          description: 'A test event',
          creator_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
          is_active: true,
          is_cancelled: false,
          participant_count: 10,
          match_count: 5,
          rank: 0.8,
          highlights: { title: '<b>Test</b> Event' },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      query: 'Test',
    };

    it('should return search results when query is provided', async () => {
      creatorEventsService.searchEvents.mockResolvedValue(searchResponse);

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/search')
        .query({ q: 'Test' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].title).toBe('Test Event');
      expect(res.body.data.total).toBe(1);
    });

    it('should return empty results when query is empty', async () => {
      creatorEventsService.searchEvents.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        query: '',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/search')
        .query({ q: '' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('should be accessible without authentication', async () => {
      creatorEventsService.searchEvents.mockResolvedValue(searchResponse);

      await request(app.getHttpServer())
        .get('/api/v1/creator-events/search')
        .query({ q: 'Test' })
        .expect(200);
    });
  });

  describe('GET /api/v1/creator-events/:id', () => {
    it('should return enriched event details for existing event', async () => {
      creatorEventsService.getEventById.mockResolvedValue(mockEnrichedEvent);

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/event-123')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('event-123');
      expect(res.body.data.title).toBe('Test Event');
      expect(res.body.data.matchCount).toBe(5);
      expect(res.body.data.matchPreview).toHaveLength(1);
      expect(res.body.data.winnerCount).toBe(3);
      expect(res.body.data.creatorVerified).toBe(true);
    });

    it('should return 404 for non-existent event', async () => {
      creatorEventsService.getEventById.mockRejectedValue({
        status: 404,
        message: 'Event not found',
        getResponse: () => ({ message: 'Event not found' }),
        getStatus: () => 404,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/non-existent')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not found');
    });

    it('should be accessible without authentication', async () => {
      creatorEventsService.getEventById.mockResolvedValue(mockEnrichedEvent);

      await request(app.getHttpServer())
        .get('/api/v1/creator-events/event-123')
        .expect(200);
    });
  });

  describe('GET /api/v1/creator-events/:id/participants', () => {
    const participantsResponse = {
      data: [
        {
          address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
          joinedAt: 1700000000,
          totalPredictions: 5,
          correctPredictions: 3,
          accuracyPct: 60,
          rank: 1,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    it('should return paginated participants with scores', async () => {
      creatorEventsService.getParticipants.mockResolvedValue(
        participantsResponse,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/event-123/participants')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].address).toBe(
        participantsResponse.data[0].address,
      );
      expect(res.body.data.data[0].accuracyPct).toBe(60);
      expect(res.body.data.data[0].rank).toBe(1);
      expect(res.body.data.total).toBe(1);
    });

    it('should support pagination query parameters', async () => {
      creatorEventsService.getParticipants.mockResolvedValue({
        ...participantsResponse,
        page: 2,
        limit: 10,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/event-123/participants')
        .query({ page: 2, limit: 10 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.page).toBe(2);
      expect(res.body.data.limit).toBe(10);
    });
  });

  describe('GET /api/v1/creator-events/:id/matches', () => {
    const matchesResponse = {
      data: [
        {
          id: 'm1',
          on_chain_match_id: 'match_1',
          team_a: 'Team A',
          team_b: 'Team B',
          match_time: '2025-02-01T00:00:00.000Z',
          result_submitted: false,
          prediction_count: 10,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    it('should return event matches with filtering and sorting', async () => {
      creatorEventsService.getEventMatches.mockResolvedValue(matchesResponse);

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/event-123/matches')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].team_a).toBe('Team A');
      expect(res.body.data.data[0].team_b).toBe('Team B');
    });

    it('should return 404 for non-existent event', async () => {
      creatorEventsService.getEventMatches.mockRejectedValue({
        status: 404,
        message: 'Event not found',
        getResponse: () => ({ message: 'Event not found' }),
        getStatus: () => 404,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/non-existent/matches')
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should filter by match status', async () => {
      creatorEventsService.getEventMatches.mockResolvedValue({
        ...matchesResponse,
        data: [],
        total: 0,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/event-123/matches')
        .query({ status: 'completed' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toEqual([]);
    });
  });

  describe('GET /api/v1/creator-events/:id/stats', () => {
    const statsResponse = {
      eventId: 'event-123',
      totalParticipants: 10,
      totalMatches: 5,
      matchesResolved: 3,
      matchesPending: 2,
      totalPredictions: 45,
      predictionDistribution: [
        {
          matchId: 'm1',
          homeTeam: 'Team A',
          awayTeam: 'Team B',
          teamA: 8,
          teamB: 5,
          draw: 2,
          total: 15,
        },
      ],
      winnersVerified: false,
      winnerCount: 0,
      averagePredictionsPerUser: 4.5,
      completionRate: 60,
    };

    it('should return event statistics', async () => {
      creatorEventsService.getEventStats.mockResolvedValue(statsResponse);

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/event-123/stats')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.eventId).toBe('event-123');
      expect(res.body.data.totalParticipants).toBe(10);
      expect(res.body.data.totalMatches).toBe(5);
      expect(res.body.data.matchesResolved).toBe(3);
      expect(res.body.data.matchesPending).toBe(2);
      expect(res.body.data.predictionDistribution).toHaveLength(1);
      expect(res.body.data.averagePredictionsPerUser).toBe(4.5);
      expect(res.body.data.completionRate).toBe(60);
    });

    it('should return 404 for non-existent event', async () => {
      creatorEventsService.getEventStats.mockRejectedValue({
        status: 404,
        message: 'Event not found',
        getResponse: () => ({ message: 'Event not found' }),
        getStatus: () => 404,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/non-existent/stats')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(404);
    });
  });

  describe('GET /api/v1/creator-events/:id/predictions/:address', () => {
    const predictionsResponse = {
      eventId: 'event-123',
      address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      predictions: [
        {
          matchId: 'm1',
          match: { team_a: 'Team A', team_b: 'Team B' },
          chosenOutcome: 'TEAM_A',
          isCorrect: true,
        },
      ],
      totalCorrect: 1,
      totalIncorrect: 0,
      score: 10,
    };

    it('should return user predictions for an event', async () => {
      creatorEventsService.getUserPredictionsForEvent.mockResolvedValue(
        predictionsResponse,
      );

      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/creator-events/event-123/predictions/${predictionsResponse.address}`,
        )
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.eventId).toBe('event-123');
      expect(res.body.data.predictions).toHaveLength(1);
      expect(res.body.data.predictions[0].chosenOutcome).toBe('TEAM_A');
      expect(res.body.data.totalCorrect).toBe(1);
      expect(res.body.data.score).toBe(10);
    });

    it('should return 404 for non-existent event', async () => {
      creatorEventsService.getUserPredictionsForEvent.mockRejectedValue({
        status: 404,
        message: 'Event not found',
        getResponse: () => ({ message: 'Event not found' }),
        getStatus: () => 404,
      });

      await request(app.getHttpServer())
        .get('/api/v1/creator-events/non-existent/predictions/some-address')
        .expect(404);
    });
  });

  describe('GET /api/v1/creator-events/:id/score/:address', () => {
    const scoreResponse = {
      eventId: 'event-123',
      address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      totalPredictions: 5,
      correctPredictions: 3,
      accuracyPct: 60,
      score: 10,
      rank: 1,
    };

    it('should return user score details', async () => {
      creatorEventsService.getUserScore.mockResolvedValue(scoreResponse);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/creator-events/event-123/score/${scoreResponse.address}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.eventId).toBe('event-123');
      expect(res.body.data.totalPredictions).toBe(5);
      expect(res.body.data.correctPredictions).toBe(3);
      expect(res.body.data.accuracyPct).toBe(60);
      expect(res.body.data.rank).toBe(1);
    });

    it('should return 404 for non-existent event', async () => {
      creatorEventsService.getUserScore.mockRejectedValue({
        status: 404,
        message: 'Event not found',
        getResponse: () => ({ message: 'Event not found' }),
        getStatus: () => 404,
      });

      await request(app.getHttpServer())
        .get('/api/v1/creator-events/non-existent/score/some-address')
        .expect(404);
    });
  });

  describe('GET /api/v1/creator-events/invite/:code', () => {
    const inviteResponse = {
      id: 'event-123',
      title: 'Test Event',
      description: 'A test event',
      creator_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      is_active: true,
      is_cancelled: false,
      participant_count: 10,
      match_count: 5,
      winners_verified: false,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
      matchPreview: [],
    };

    it('should return event by invite code', async () => {
      creatorEventsService.getEventByInviteCode.mockResolvedValue(
        inviteResponse,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/invite/invite-code-123')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('event-123');
      expect(res.body.data.title).toBe('Test Event');
    });

    it('should return 404 for invalid invite code', async () => {
      creatorEventsService.getEventByInviteCode.mockRejectedValue({
        status: 404,
        message: 'Event not found',
        getResponse: () => ({ message: 'Event not found' }),
        getStatus: () => 404,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/invite/invalid-code')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(404);
    });

    it('should be accessible without authentication', async () => {
      creatorEventsService.getEventByInviteCode.mockResolvedValue(
        inviteResponse,
      );

      await request(app.getHttpServer())
        .get('/api/v1/creator-events/invite/invite-code-123')
        .expect(200);
    });

    it('should return match preview in response', async () => {
      const withMatches = {
        ...inviteResponse,
        matchPreview: [
          {
            id: 'm1',
            team_a: 'Team A',
            team_b: 'Team B',
            match_time: '2025-02-01T00:00:00.000Z',
          },
        ],
      };
      creatorEventsService.getEventByInviteCode.mockResolvedValue(withMatches);

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/invite/invite-code-123')
        .expect(200);

      expect(res.body.data.matchPreview).toHaveLength(1);
      expect(res.body.data.matchPreview[0].team_a).toBe('Team A');
    });
  });

  describe('Response envelope consistency', () => {
    it('should include success, data, and timestamp in successful responses', async () => {
      creatorEventsService.getEventById.mockResolvedValue(mockEnrichedEvent);

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/event-123')
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('timestamp');
      expect(typeof res.body.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
    });

    it('should include success, error, and timestamp in error responses', async () => {
      creatorEventsService.getEventById.mockRejectedValue({
        status: 404,
        message: 'Event not found',
        getResponse: () => ({ message: 'Event not found' }),
        getStatus: () => 404,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/creator-events/non-existent')
        .expect(404);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 404);
      expect(res.body.error).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
    });
  });
});
