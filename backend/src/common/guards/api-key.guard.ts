import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKey } from '../../auth/entities/api-key.entity';
import { ApiKeyService } from '../../auth/api-key.service';
import { SCOPES_KEY } from '../decorators/scopes.decorator';

interface ApiKeyRequest extends Request {
  // other guards (JwtAuthGuard) populate request.user.
  // Keep it permissive to satisfy TS Request typing.
  user?: any;
  apiKey?: ApiKey;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();

    const rawKey = request.headers['x-api-key'];

    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedException('X-API-Key header is required');
    }

    // Throws 401 if key is invalid, revoked, or expired
    const apiKey = await this.apiKeyService.validateKey(rawKey);

    // Populate request.user from the key's owner (mirrors JWT guard behaviour)
    request.user = apiKey.user;
    request.apiKey = apiKey;

    // Scope enforcement — returns 403 when key lacks a required scope
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredScopes && requiredScopes.length > 0) {
      const missing = requiredScopes.filter(
        (scope) => !apiKey.scopes.includes(scope),
      );
      if (missing.length > 0) {
        throw new ForbiddenException(
          `API key missing required scope(s): ${missing.join(', ')}`,
        );
      }
    }

    // Throttled last_used_at update — fire-and-forget, never blocks the request
    this.apiKeyService.touchLastUsed(apiKey);

    return true;
  }
}
