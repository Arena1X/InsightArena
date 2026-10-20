import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from '../../auth/api-key.service';
import { ApiKey } from '../../auth/entities/api-key.entity';
import { SCOPES_KEY } from '../decorators/scopes.decorator';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let apiKeyService: jest.Mocked<ApiKeyService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    apiKeyService = {
      validateKey: jest.fn(),
      touchLastUsed: jest.fn(),
    } as unknown as jest.Mocked<ApiKeyService>;

    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new ApiKeyGuard(apiKeyService, reflector);
  });

  const mockExecutionContext = (
    headers: Record<string, string> = {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  it('should throw UnauthorizedException if X-API-Key header is missing', async () => {
    const context = mockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should validate the key and allow access when no scopes are required', async () => {
    const context = mockExecutionContext({ 'x-api-key': 'ia_validkey' });
    const mockApiKey = {
      id: 'key1',
      user: { id: 'user1' },
      scopes: [],
    } as unknown as ApiKey;

    apiKeyService.validateKey.mockResolvedValue(mockApiKey);
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeyService.validateKey).toHaveBeenCalledWith('ia_validkey');
    expect(apiKeyService.touchLastUsed).toHaveBeenCalledWith(mockApiKey);
  });

  it('should allow access when the key has all required scopes', async () => {
    const context = mockExecutionContext({ 'x-api-key': 'ia_validkey' });
    const mockApiKey = {
      id: 'key1',
      user: { id: 'user1' },
      scopes: ['markets:read', 'predictions:write'],
    } as unknown as ApiKey;

    apiKeyService.validateKey.mockResolvedValue(mockApiKey);
    reflector.getAllAndOverride.mockReturnValue(['markets:read']);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if the key lacks a required scope', async () => {
    const context = mockExecutionContext({ 'x-api-key': 'ia_validkey' });
    const mockApiKey = {
      id: 'key1',
      user: { id: 'user1' },
      scopes: ['markets:read'], // Missing 'predictions:write'
    } as unknown as ApiKey;

    apiKeyService.validateKey.mockResolvedValue(mockApiKey);
    reflector.getAllAndOverride.mockReturnValue([
      'markets:read',
      'predictions:write',
    ]);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'API key missing required scope(s): predictions:write',
    );
  });

  it('should populate the request with the user and apiKey', async () => {
    const req = { headers: { 'x-api-key': 'ia_validkey' } } as any;
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    const mockUser = { id: 'user1' };
    const mockApiKey = {
      id: 'key1',
      user: mockUser,
      scopes: [],
    } as unknown as ApiKey;

    apiKeyService.validateKey.mockResolvedValue(mockApiKey);
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await guard.canActivate(context);

    expect(req.user).toBe(mockUser);
    expect(req.apiKey).toBe(mockApiKey);
  });
});
