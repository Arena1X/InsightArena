import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JsonWebTokenError, TokenExpiredError } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockReflector = (isPublic: boolean) =>
  ({
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  }) as unknown as Reflector;

const mockContext = () =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({ headers: {} }),
    }),
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  describe('canActivate', () => {
    it('returns true for @Public() routes without calling super', () => {
      const guard = new JwtAuthGuard(mockReflector(true));
      const ctx = mockContext();
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('delegates to AuthGuard for non-public routes', () => {
      const guard = new JwtAuthGuard(mockReflector(false));
      const superSpy = jest
        .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockReturnValue(true);
      const ctx = mockContext();
      guard.canActivate(ctx);
      expect(superSpy).toHaveBeenCalledWith(ctx);
      superSpy.mockRestore();
    });
  });

  describe('handleRequest', () => {
    let guard: JwtAuthGuard;

    beforeEach(() => {
      guard = new JwtAuthGuard(mockReflector(false));
    });

    it('returns the user when token is valid', () => {
      const user = { userId: '1', email: 'test@example.com' };
      expect(guard.handleRequest(null, user, null)).toBe(user);
    });

    it('throws 401 with "Token expired" for expired tokens', () => {
      expect(() =>
        guard.handleRequest(null, null, new TokenExpiredError('jwt expired', new Date())),
      ).toThrow(new UnauthorizedException('Token expired'));
    });

    it('throws 401 for invalid/malformed tokens', () => {
      expect(() =>
        guard.handleRequest(null, null, new JsonWebTokenError('invalid token')),
      ).toThrow(UnauthorizedException);
    });

    it('throws 401 when no token is provided (missing user)', () => {
      expect(() => guard.handleRequest(null, null, null)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when err is present', () => {
      expect(() =>
        guard.handleRequest(new Error('some error'), null, null),
      ).toThrow(UnauthorizedException);
    });
  });
});
