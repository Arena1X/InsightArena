import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler/dist/throttler-module-options.interface';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { THROTTLE_TIER_KEY } from '../decorators/throttle-tier.decorator';

@Injectable()
export class TieredThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const tier = this.reflector.getAllAndOverride<string>(THROTTLE_TIER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const tierName = tier ?? 'default';

    const tierThrottlers = this.throttlers.filter((t) => t.name === tierName);

    if (tierThrottlers.length === 0) {
      return true;
    }

    const originalThrottlers = this.throttlers;
    this.throttlers = tierThrottlers;

    try {
      return await super.canActivate(context);
    } finally {
      this.throttlers = originalThrottlers;
    }
  }

  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    const userId = this.extractUserId(req);
    if (userId) {
      return `user:${userId}`;
    }
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }

  protected override generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    const req = context.switchToHttp().getRequest();
    const userId = this.extractUserId(req);
    const tracker = userId
      ? `user:${userId}`
      : (req.ip ?? req.socket?.remoteAddress ?? 'unknown');
    return `throttle:${name}:${tracker}:${suffix}`;
  }

  private extractUserId(req: Record<string, any>): string | null {
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice(7);
    try {
      const payload = this.jwtService.decode(token);
      if (payload && typeof payload === 'object' && payload.sub) {
        return payload.sub;
      }
    } catch {
      // Token decode failed — treat as unauthenticated
    }
    return null;
  }
}
