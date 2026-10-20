import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BanGuard } from './ban.guard';

describe('BanGuard', () => {
  let guard: BanGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BanGuard],
    }).compile();

    guard = module.get<BanGuard>(BanGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow non-banned users to pass through', () => {
      const mockRequest = {
        user: {
          is_banned: false,
          ban_reason: null,
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow anonymous users (no user object) to pass through', () => {
      const mockRequest = {
        user: undefined,
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should throw ForbiddenException for banned users with reason', () => {
      const mockRequest = {
        user: {
          is_banned: true,
          ban_reason: 'spam',
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        /Your account has been banned. Reason: spam/,
      );
    });

    it('should throw ForbiddenException for banned users with multiple word reason', () => {
      const mockRequest = {
        user: {
          is_banned: true,
          ban_reason: 'repeated violations',
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        /Your account has been banned. Reason: repeated violations/,
      );
    });

    it('should throw ForbiddenException for banned users without reason', () => {
      const mockRequest = {
        user: {
          is_banned: true,
          ban_reason: null,
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        /Your account has been banned. Reason: No reason provided/,
      );
    });

    it('should throw ForbiddenException with message containing ban reason', () => {
      const banReason = 'policy violation';
      const mockRequest = {
        user: {
          is_banned: true,
          ban_reason: banReason,
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      try {
        guard.canActivate(context);
      } catch (e) {
        const response = e.getResponse();
        const responseString = JSON.stringify(response);
        expect(responseString).toContain(banReason);
      }
    });

    it('should handle empty ban_reason string', () => {
      const mockRequest = {
        user: {
          is_banned: true,
          ban_reason: '',
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      // Empty string is falsy, so it should use default message
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        /Your account has been banned. Reason: No reason provided/,
      );
    });

    it('should handle user object with missing properties', () => {
      const mockRequest = {
        user: {},
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      // User exists but is not banned (is_banned is falsy)
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle is_banned = false with null reason', () => {
      const mockRequest = {
        user: {
          is_banned: false,
          ban_reason: null,
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any as ExecutionContext;

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should reject multiple banned users with different reasons', () => {
      const testCases = [
        { reason: 'harassment', description: 'harassment case' },
        { reason: 'abuse', description: 'abuse case' },
        { reason: 'fraud', description: 'fraud case' },
      ];

      for (const testCase of testCases) {
        const mockRequest = {
          user: {
            is_banned: true,
            ban_reason: testCase.reason,
          },
        };

        const context = {
          switchToHttp: () => ({
            getRequest: () => mockRequest,
          }),
        } as any as ExecutionContext;

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        expect(() => guard.canActivate(context)).toThrow(
          new RegExp(testCase.reason),
        );
      }
    });
  });
});
