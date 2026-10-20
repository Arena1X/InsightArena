import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { CACHE_NAMESPACE_TTL_MS, DEFAULT_TTL_MS } from './cache.policy';

/**
 * Thin wrapper around cache-manager's Cache that adds:
 *
 * 1. Per-namespace TTL policy (see cache.policy.ts) so callers don't need
 *    to invent and track their own TTL constants per feature.
 * 2. Single-flight stampede protection: concurrent `getOrSet` calls for the
 *    same key, while the value is cold, share one in-flight computation
 *    instead of each triggering its own recompute.
 *
 * Single-flight is in-process only (a plain `Map<string, Promise>`) — it
 * protects a single Node instance from a thundering herd on a cold key. It
 * does not coordinate across horizontally-scaled replicas, since the
 * underlying store here is cache-manager's in-memory backend, not Redis.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * Returns the cached value for `key` if present; otherwise computes it
   * via `loader`, caches the result under `namespace`'s TTL policy, and
   * returns it. Concurrent calls for the same key while the value is cold
   * share a single `loader` invocation.
   */
  async getOrSet<T>(
    namespace: string,
    key: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cacheKey = `${namespace}:${key}`;

    const cached = await this.cacheManager.get<T>(cacheKey);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const pending = this.inFlight.get(cacheKey);
    if (pending) {
      return pending as Promise<T>;
    }

    const ttlMs = this.resolveTtl(namespace);
    const computation = (async () => {
      try {
        const value = await loader();
        await this.cacheManager.set(cacheKey, value, ttlMs);
        return value;
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, computation);
    return computation;
  }

  /** Invalidates a single cached key within a namespace. */
  async invalidate(namespace: string, key: string): Promise<void> {
    await this.cacheManager.del(`${namespace}:${key}`);
  }

  private resolveTtl(namespace: string): number {
    return CACHE_NAMESPACE_TTL_MS[namespace] ?? DEFAULT_TTL_MS;
  }
}
