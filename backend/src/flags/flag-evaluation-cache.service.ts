import { Injectable, Scope } from '@nestjs/common';
import { ResolvedFlagDto } from './feature-flags.service';

/**
 * Default freshness bound (TTL) for cached feature flag evaluations: 60,000 ms (60 seconds).
 * Guarantees evaluations do not become stale past this bound even without explicit invalidation.
 */
export const DEFAULT_FLAG_EVALUATION_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: ResolvedFlagDto;
  expiresAt: number;
}

/**
 * Cache of resolved feature-flag evaluations with TTL bounds and explicit invalidation.
 * Request-scoped by default, but bounded by TTL so evaluations respect freshness limits
 * and can be invalidated whenever a flag is updated.
 */
@Injectable({ scope: Scope.REQUEST })
export class FlagEvaluationCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;

  constructor(ttlMs: number = DEFAULT_FLAG_EVALUATION_CACHE_TTL_MS) {
    this.defaultTtlMs = ttlMs;
  }

  private key(flagKey: string, userId: string): string {
    return `${flagKey}:${userId}`;
  }

  /**
   * Retrieves a cached flag evaluation if present and within its TTL bound.
   * Returns undefined if expired (and cleans up the stale entry).
   */
  get(flagKey: string, userId: string): ResolvedFlagDto | undefined {
    const cacheKey = this.key(flagKey, userId);
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Caches a resolved flag evaluation with an expiration time based on TTL.
   */
  set(
    flagKey: string,
    userId: string,
    value: ResolvedFlagDto,
    ttlMs: number = this.defaultTtlMs,
  ): void {
    this.cache.set(this.key(flagKey, userId), {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Invalidates cached evaluations for a specific flag across all users.
   * Used to immediately purge stale evaluations on flag update/delete.
   */
  invalidate(flagKey: string): void {
    const prefix = `${flagKey}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidates cached evaluations for a specific user across all flags.
   */
  invalidateUser(userId: string): void {
    const suffix = `:${userId}`;
    for (const key of this.cache.keys()) {
      if (key.endsWith(suffix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears all cached evaluations.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns the current number of cached entries.
   */
  size(): number {
    return this.cache.size;
  }
}
