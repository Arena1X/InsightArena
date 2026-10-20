import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  CallHandler,
  INestApplication,
} from '@nestjs/common';
import { of } from 'rxjs';
import { ActivityLoggingInterceptor } from './activity-logging.interceptor';
import { AnalyticsService } from '../../analytics/analytics.service';

describe('ActivityLoggingInterceptor', () => {
  let interceptor: ActivityLoggingInterceptor;
  let analyticsService: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLoggingInterceptor,
        {
          provide: AnalyticsService,
          useValue: {
            logActivity: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<ActivityLoggingInterceptor>(
      ActivityLoggingInterceptor,
    );
    analyticsService = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('POST /markets', () => {
    it('should log MARKET_CREATED action type', (done) => {
      const mockRequest = {
        method: 'POST',
        url: '/markets',
        user: { id: 'user-123' },
        body: { title: 'Test Market' },
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).toHaveBeenCalledWith(
          'user-123',
          'MARKET_CREATED',
          mockRequest.body,
          '127.0.0.1',
        );
        done();
      });
    });
  });

  describe('POST /predictions', () => {
    it('should log PREDICTION_MADE action type', (done) => {
      const mockRequest = {
        method: 'POST',
        url: '/predictions',
        user: { id: 'user-456' },
        body: { market_id: 1, stake: 100 },
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).toHaveBeenCalledWith(
          'user-456',
          'PREDICTION_MADE',
          mockRequest.body,
          '127.0.0.1',
        );
        done();
      });
    });
  });

  describe('POST /competitions', () => {
    it('should log COMPETITION_CREATED action type', (done) => {
      const mockRequest = {
        method: 'POST',
        url: '/competitions',
        user: { id: 'user-789' },
        body: { name: 'Test Competition' },
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).toHaveBeenCalledWith(
          'user-789',
          'COMPETITION_CREATED',
          mockRequest.body,
          '127.0.0.1',
        );
        done();
      });
    });
  });

  describe('PATCH /admin/users/:id/ban', () => {
    it('should log USER_BANNED action type', (done) => {
      const mockRequest = {
        method: 'PATCH',
        url: '/admin/users/123/ban',
        user: { id: 'admin-user' },
        body: { reason: 'Spam' },
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).toHaveBeenCalledWith(
          'admin-user',
          'USER_BANNED',
          mockRequest.body,
          '127.0.0.1',
        );
        done();
      });
    });
  });

  describe('PATCH /admin/users/:id/unban', () => {
    it('should log USER_UNBANNED action type', (done) => {
      const mockRequest = {
        method: 'PATCH',
        url: '/admin/users/123/unban',
        user: { id: 'admin-user' },
        body: {},
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).toHaveBeenCalledWith(
          'admin-user',
          'USER_UNBANNED',
          mockRequest.body,
          '127.0.0.1',
        );
        done();
      });
    });
  });

  describe('PATCH /admin/markets/:id/resolve', () => {
    it('should log MARKET_RESOLVED_BY_ADMIN action type', (done) => {
      const mockRequest = {
        method: 'PATCH',
        url: '/admin/markets/123/resolve',
        user: { id: 'admin-user' },
        body: { outcome: 'yes' },
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).toHaveBeenCalledWith(
          'admin-user',
          'MARKET_RESOLVED_BY_ADMIN',
          mockRequest.body,
          '127.0.0.1',
        );
        done();
      });
    });
  });

  describe('GET endpoints', () => {
    it('should not log activity for GET requests', (done) => {
      const mockRequest = {
        method: 'GET',
        url: '/markets',
        user: { id: 'user-123' },
        body: {},
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).not.toHaveBeenCalled();
        done();
      });
    });
  });

  describe('unlisted routes', () => {
    it('should not log activity for unmapped routes', (done) => {
      const mockRequest = {
        method: 'POST',
        url: '/unknown-route',
        user: { id: 'user-123' },
        body: {},
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).not.toHaveBeenCalled();
        done();
      });
    });
  });

  describe('requests without user', () => {
    it('should not log activity when user is not present', (done) => {
      const mockRequest = {
        method: 'POST',
        url: '/markets',
        user: undefined,
        body: { title: 'Test Market' },
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).not.toHaveBeenCalled();
        done();
      });
    });
  });

  describe('password sanitization', () => {
    it('should sanitize password from body', (done) => {
      const mockRequest = {
        method: 'POST',
        url: '/markets',
        user: { id: 'user-123' },
        body: { title: 'Test Market', password: 'secret123' },
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        expect(analyticsService.logActivity).toHaveBeenCalledWith(
          'user-123',
          'MARKET_CREATED',
          { title: 'Test Market' },
          '127.0.0.1',
        );
        done();
      });
    });
  });

  describe('DELETE method', () => {
    it('should log activity for DELETE requests', (done) => {
      const mockRequest = {
        method: 'DELETE',
        url: '/markets/123',
        user: { id: 'user-123' },
        body: {},
        ip: '127.0.0.1',
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const next = {
        handle: () => of({}),
      } as CallHandler;

      interceptor.intercept(context, next).subscribe(() => {
        // DELETE on unmapped route should not log
        expect(analyticsService.logActivity).not.toHaveBeenCalled();
        done();
      });
    });
  });
});
