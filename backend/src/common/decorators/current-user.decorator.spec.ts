import { ExecutionContext } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { User } from '../../users/entities/user.entity';

describe('CurrentUser Decorator', () => {
  let mockUser: User;
  let mockExecutionContext: ExecutionContext;

  beforeEach(() => {
    mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      roles: ['user'],
    } as User;

    const mockRequest = {
      user: mockUser,
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(CurrentUser).toBeDefined();
  });

  it('should return a decorator function', () => {
    expect(typeof CurrentUser).toBe('function');
  });

  it('should extract user from request', () => {
    const result = CurrentUser(undefined, mockExecutionContext);
    expect(result).toBe(mockUser);
  });

  it('should return user with correct id', () => {
    const result = CurrentUser(undefined, mockExecutionContext);
    expect(result.id).toBe('user-123');
  });

  it('should return user with correct username', () => {
    const result = CurrentUser(undefined, mockExecutionContext);
    expect(result.username).toBe('testuser');
  });

  it('should return user with correct email', () => {
    const result = CurrentUser(undefined, mockExecutionContext);
    expect(result.email).toBe('test@example.com');
  });

  it('should return user with correct roles', () => {
    const result = CurrentUser(undefined, mockExecutionContext);
    expect(result.roles).toContain('user');
  });

  it('should handle admin user', () => {
    const adminUser: User = {
      id: 'admin-456',
      username: 'admin',
      email: 'admin@example.com',
      roles: ['admin'],
    } as User;

    const mockRequest = { user: adminUser };
    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ExecutionContext;

    const result = CurrentUser(undefined, context);
    expect(result.id).toBe('admin-456');
    expect(result.roles).toContain('admin');
  });

  it('should handle user with multiple roles', () => {
    const multiRoleUser: User = {
      id: 'user-789',
      username: 'poweruser',
      email: 'power@example.com',
      roles: ['user', 'moderator'],
    } as User;

    const mockRequest = { user: multiRoleUser };
    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ExecutionContext;

    const result = CurrentUser(undefined, context);
    expect(result.roles.length).toBe(2);
    expect(result.roles).toContain('user');
    expect(result.roles).toContain('moderator');
  });

  it('should ignore data parameter and extract from context', () => {
    const differentData = { someKey: 'someValue' };
    const result = CurrentUser(differentData, mockExecutionContext);
    expect(result).toBe(mockUser);
    expect(result.id).not.toBe('someKey');
  });

  it('should switch to HTTP context', () => {
    const switchToHttpSpy = jest.spyOn(mockExecutionContext, 'switchToHttp');
    CurrentUser(undefined, mockExecutionContext);
    expect(switchToHttpSpy).toHaveBeenCalled();
  });

  it('should call getRequest on HTTP context', () => {
    const httpContext = mockExecutionContext.switchToHttp();
    const getRequestSpy = jest.spyOn(httpContext, 'getRequest');
    CurrentUser(undefined, mockExecutionContext);
    expect(getRequestSpy).toHaveBeenCalled();
  });

  it('should return entire User object', () => {
    const result = CurrentUser(undefined, mockExecutionContext);
    expect(result).toEqual(mockUser);
  });

  it('should preserve user object properties', () => {
    const complexUser: User = {
      id: 'complex-user',
      username: 'complex',
      email: 'complex@test.com',
      roles: ['user', 'beta-tester'],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-15'),
    } as User;

    const mockRequest = { user: complexUser };
    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ExecutionContext;

    const result = CurrentUser(undefined, context);
    expect(result.id).toBe('complex-user');
    expect(result.username).toBe('complex');
    expect(result.email).toBe('complex@test.com');
    expect(result.roles.length).toBe(2);
  });

  it('should work with authenticated user in request', () => {
    const authenticatedUser: User = {
      id: 'auth-user-123',
      username: 'authuser',
      email: 'auth@example.com',
      roles: ['user'],
      isActive: true,
    } as User;

    const mockRequest = { user: authenticatedUser };
    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ExecutionContext;

    const result = CurrentUser(undefined, context);
    expect(result).toBe(authenticatedUser);
    expect(result.isActive).toBe(true);
  });

  it('should not modify the original user object', () => {
    const originalUser = { ...mockUser };
    CurrentUser(undefined, mockExecutionContext);
    expect(mockUser).toEqual(originalUser);
  });

  describe('decorator usage scenarios', () => {
    it('should work for extracting user in controller method', () => {
      const result = CurrentUser(undefined, mockExecutionContext);
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should provide user identity for authorization checks', () => {
      const result = CurrentUser(undefined, mockExecutionContext);
      expect(result.id).toBe('user-123');
    });

    it('should provide user roles for permission verification', () => {
      const result = CurrentUser(undefined, mockExecutionContext);
      expect(Array.isArray(result.roles)).toBe(true);
    });

    it('should be reusable for multiple requests', () => {
      const result1 = CurrentUser(undefined, mockExecutionContext);
      const result2 = CurrentUser(undefined, mockExecutionContext);
      expect(result1).toEqual(result2);
    });
  });
});
