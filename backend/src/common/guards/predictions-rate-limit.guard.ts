import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectThrottlerStorage, ThrottlerStorage } from '@nestjs/throttler';
import {
  RateLimitHeaderResponse,
  setRateLimitHeaders,
} from '../rate-limit-headers.util';

/**
 * Per-user rate limiting guard for prediction submissions.
 * Enforces a configurable limit on prediction submissions per user within a time window.
 * Returns HTTP 429 with rate-limit headers when limit is exceeded.
 *
 * Configured via environment variables:
 * - PREDICTIONS_RATE_LIMIT: max submissions per window (default: 30)
 * - PREDICTIONS_RATE_LIMIT_WINDOW_MS: time window in milliseconds (default: 60000 = 1 minute)
 */
@Injectable()
export class PredictionsRateLimitGuard implements CanActivate {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly storageKey = 'predictions_rate_limit';

  constructor(
    @InjectThrottlerStorage()
    private readonly throttlerStorage: ThrottlerStorage,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.limit = this.configService.get<number>('PREDICTIONS_RATE_LIMIT', 30);
    this.windowMs = this.configService.get<number>(
      'PREDICTIONS_RATE_LIMIT_WINDOW_MS',
      60_000,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = this.extractUserId(request);

    if (!userId) {
      // Unauthenticated requests pass through (will be caught by auth guard)
      return true;
    }

    const key = `${this.storageKey}:${userId}`;

    try {
      const record = await this.throttlerStorage.increment(
        key,
        this.windowMs,
        this.limit,
        this.limit,
        'predictions',
      );

      const remaining = Math.max(0, this.limit - record.totalHits);
      const resetSeconds = Math.ceil(this.windowMs / 1000);

      const response = context
        .switchToHttp()
        .getResponse<RateLimitHeaderResponse>();
      setRateLimitHeaders(response, {
        limit: this.limit,
        remaining,
        resetSeconds,
        retryAfterSeconds: resetSeconds,
      });

      if (record.totalHits > this.limit) {
        setRateLimitHeaders(response, {
          limit: this.limit,
          remaining: 0,
          resetSeconds,
          retryAfterSeconds: resetSeconds,
        });

        throw new HttpException(
          `Rate limit exceeded for prediction submissions. Limit: ${this.limit} per ${resetSeconds} seconds`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Log but don't block on storage errors
      console.error('Predictions rate limit check failed:', error);
      return true;
    }
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
