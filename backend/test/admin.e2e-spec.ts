import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ExecutionContext,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let adminService: jest.Mocked<AdminService>;

  const mockAdminUser = {
    id: 'admin-uuid',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
    role: 'admin',
  };

  beforeEach(async () => {
    adminService = {
      getStats: jest.fn(),
      getFeeStats: jest.fn(),
      listVerifiedAddresses: jest.fn(),
      listCreatorEventsForModeration: jest.fn(),
      listUsers: jest.fn(),
      getUserActivity: jest.fn(),
      banUser: jest.fn(),
      unbanUser: jest.fn(),
      updateUserRole: jest.fn(),
      listFlags: jest.fn(),
      resolveFlag: jest.fn(),
      adminResolveMarket: jest.fn(),
      adminCancelCompetition: jest.fn(),
      featureMarket: jest.fn(),
      unfeatureMarket: jest.fn(),
      moderateComment: jest.fn(),
      getActivityReport: jest.fn(),
    } as unknown as jest.Mocked<AdminService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: adminService,
        },
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = mockAdminUser;
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

  describe('GET /api/v1/admin/dashboard/stats', () => {
    const mockStats = {
      total_users: 150,
      active_users_24h: 42,
      active_users_7d: 98,
      total_markets: 300,
      active_markets: 120,
      resolved_markets: 150,
      cancelled_markets: 30,
      total_predictions: 5000,
      total_volume_stroops: '1000000000',
      fees_collected_stroops: '50000000',
      pending_flags: 5,
      new_users_today: 12,
      average_predictions_per_user: 33.33,
      total_rewards_paid_stroops: '200000000',
      competition_count: 8,
      active_competitions: 3,
      total_disputes: 15,
      open_disputes: 4,
    };

    it('should return dashboard statistics for admin', async () => {
      adminService.getStats.mockResolvedValue(mockStats);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard/stats')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total_users).toBe(150);
      expect(res.body.data.active_users_24h).toBe(42);
      expect(res.body.data.total_markets).toBe(300);
      expect(res.body.data.active_markets).toBe(120);
      expect(res.body.data.resolved_markets).toBe(150);
      expect(res.body.data.total_predictions).toBe(5000);
      expect(res.body.data.total_volume_stroops).toBe('1000000000');
      expect(res.body.data.pending_flags).toBe(5);
    });

    it('should return 401 without authorization', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard/stats')
        .expect(401);
    });
  });

  describe('GET /api/v1/admin/users', () => {
    const usersResponse = {
      data: [
        {
          id: 'user-1',
          stellar_address: 'GBRP...',
          username: 'user1',
          role: 'user',
          reputation_score: 50,
          total_predictions: 10,
          is_banned: false,
          created_at: new Date('2024-01-01'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    it('should return paginated users list', async () => {
      adminService.listUsers.mockResolvedValue(usersResponse);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].username).toBe('user1');
      expect(res.body.data.total).toBe(1);
    });

    it('should support search and filter query parameters', async () => {
      adminService.listUsers.mockResolvedValue({
        ...usersResponse,
        total: 0,
        data: [],
      });

      await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .query({ search: 'nonexistent', role: 'admin' })
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(adminService.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'nonexistent', role: 'admin' }),
      );
    });
  });

  describe('PATCH /api/v1/admin/users/:id/ban', () => {
    it('should ban a user with reason', async () => {
      adminService.banUser.mockResolvedValue({
        id: 'user-1',
        is_banned: true,
        ban_reason: 'Violation of terms',
        banned_by: 'admin-uuid',
        banned_at: new Date().toISOString(),
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/users/user-1/ban')
        .send({ reason: 'Violation of terms' })
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.is_banned).toBe(true);
      expect(adminService.banUser).toHaveBeenCalledWith(
        'user-1',
        'Violation of terms',
        'admin-uuid',
      );
    });
  });

  describe('PATCH /api/v1/admin/users/:id/unban', () => {
    it('should unban a user', async () => {
      adminService.unbanUser.mockResolvedValue({
        id: 'user-1',
        is_banned: false,
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/users/user-1/unban')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.is_banned).toBe(false);
      expect(adminService.unbanUser).toHaveBeenCalledWith(
        'user-1',
        'admin-uuid',
      );
    });
  });

  describe('PATCH /api/v1/admin/users/:id/role', () => {
    it('should update user role', async () => {
      adminService.updateUserRole.mockResolvedValue({
        id: 'user-1',
        role: 'moderator',
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/users/user-1/role')
        .send({ role: 'moderator' })
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('moderator');
      expect(adminService.updateUserRole).toHaveBeenCalledWith(
        'user-1',
        { role: 'moderator' },
        'admin-uuid',
      );
    });
  });

  describe('GET /api/v1/admin/users/:id/activity', () => {
    const activityResponse = {
      data: [
        {
          id: 'log-1',
          action: 'LOGIN',
          timestamp: new Date('2025-01-01').toISOString(),
          ip_address: '127.0.0.1',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };

    it('should return user activity logs', async () => {
      adminService.getUserActivity.mockResolvedValue(activityResponse);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/users/user-1/activity')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].action).toBe('LOGIN');
    });
  });

  describe('GET /api/v1/admin/flags', () => {
    const flagsResponse = {
      data: [
        {
          id: 'flag-1',
          reason: 'Inappropriate content',
          status: 'pending',
          created_at: new Date('2025-01-01'),
          reporter: { stellar_address: 'GBRP...' },
          market: { id: 'm1', title: 'Market 1' },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };

    it('should return list of flags', async () => {
      adminService.listFlags.mockResolvedValue(flagsResponse);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/flags')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].reason).toBe('Inappropriate content');
    });
  });

  describe('PATCH /api/v1/admin/flags/:id/resolve', () => {
    it('should resolve a flag', async () => {
      adminService.resolveFlag.mockResolvedValue({
        id: 'flag-1',
        status: 'resolved',
        resolved_by: 'admin-uuid',
        resolution: 'No action needed',
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/flags/flag-1/resolve')
        .send({ resolution: 'No action needed', action: 'dismiss' })
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('resolved');
    });
  });

  describe('POST /api/v1/admin/markets/:id/resolve', () => {
    it('should resolve a market with an outcome', async () => {
      adminService.adminResolveMarket.mockResolvedValue({
        id: 'market-1',
        is_resolved: true,
        resolved_outcome: 'Yes',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/markets/market-1/resolve')
        .send({ outcome: 'Yes' })
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.is_resolved).toBe(true);
      expect(res.body.data.resolved_outcome).toBe('Yes');
      expect(adminService.adminResolveMarket).toHaveBeenCalledWith(
        'market-1',
        { outcome: 'Yes' },
        'admin-uuid',
      );
    });
  });

  describe('PATCH /api/v1/admin/markets/:id/feature', () => {
    it('should feature a market', async () => {
      adminService.featureMarket.mockResolvedValue({
        id: 'market-1',
        is_featured: true,
        featured_at: new Date().toISOString(),
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/markets/market-1/feature')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.is_featured).toBe(true);
    });
  });

  describe('PATCH /api/v1/admin/markets/:id/unfeature', () => {
    it('should unfeature a market', async () => {
      adminService.unfeatureMarket.mockResolvedValue({
        id: 'market-1',
        is_featured: false,
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/markets/market-1/unfeature')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.is_featured).toBe(false);
    });
  });

  describe('PATCH /api/v1/admin/comments/:id/moderate', () => {
    it('should moderate a comment', async () => {
      adminService.moderateComment.mockResolvedValue({
        id: 'comment-1',
        is_moderated: true,
        moderation_reason: 'Inappropriate language',
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/comments/comment-1/moderate')
        .send({ is_moderated: true, reason: 'Inappropriate language' })
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.is_moderated).toBe(true);
    });
  });

  describe('GET /api/v1/admin/creator-events/verified-addresses', () => {
    const verifiedResponse = {
      data: [
        {
          id: 'va-1',
          address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
          verified_at: new Date('2025-01-01'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };

    it('should return verified addresses', async () => {
      adminService.listVerifiedAddresses.mockResolvedValue(verifiedResponse);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/creator-events/verified-addresses')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].address).toBe(
        verifiedResponse.data[0].address,
      );
    });
  });

  describe('GET /api/v1/admin/reports/activity', () => {
    it('should return activity report as JSON', async () => {
      adminService.getActivityReport.mockResolvedValue({
        data: [
          {
            date: '2025-01-01',
            new_users: 10,
            active_users: 50,
            predictions: 200,
          },
        ],
        total: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/activity')
        .query({ from: '2025-01-01', to: '2025-01-31' })
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
    });

    it('should return 401 without authorization', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/reports/activity')
        .expect(401);
    });
  });

  describe('DELETE /api/v1/admin/competitions/:id', () => {
    it('should cancel a competition', async () => {
      adminService.adminCancelCompetition.mockResolvedValue({
        id: 'comp-1',
        status: 'cancelled',
      });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/admin/competitions/comp-1')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');
    });
  });

  describe('Authorization', () => {
    it('should return 401 for all admin endpoints without token', async () => {
      const endpoints = [
        { method: 'get' as const, path: '/api/v1/admin/dashboard/stats' },
        { method: 'get' as const, path: '/api/v1/admin/users' },
        { method: 'get' as const, path: '/api/v1/admin/flags' },
      ];

      for (const ep of endpoints) {
        await request(app.getHttpServer())[ep.method](ep.path).expect(401);
      }
    });
  });
});
