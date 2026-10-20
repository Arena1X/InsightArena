import { Injectable, Scope } from '@nestjs/common';
import { ResolvedFlagDto } from './feature-flags.service';

/**
 * Per-request cache of resolved feature-flag evaluations. Request-scoped so
 * a fresh, empty cache is created for every incoming request and discarded
 * afterwards - repeated flag lookups for the same user within one request
 * (e.g. a guard and a controller both resolving the same key) reuse the
 * first evaluation instead of re-querying and re-hashing on every call.
 */
@Injectable({ scope: Scope.REQUEST })
export class FlagEvaluationCacheService {
  private readonly cache = new Map<string, ResolvedFlagDto>();

  private key(flagKey: string, userId: string): string {
    return `${flagKey}:${userId}`;
  }

  get(flagKey: string, userId: string): ResolvedFlagDto | undefined {
    return this.cache.get(this.key(flagKey, userId));
  }

  set(flagKey: string, userId: string, value: ResolvedFlagDto): void {
    this.cache.set(this.key(flagKey, userId), value);
  }
}
