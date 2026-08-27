/**
 * Per-namespace TTL policy for CacheService.getOrSet. Add an entry here
 * when a new namespace needs a TTL other than DEFAULT_TTL_MS — keeps TTL
 * tuning in one place instead of scattered magic numbers per service.
 */
export const CACHE_NAMESPACE_TTL_MS: Record<string, number> = {
  'analytics:category': 5 * 60 * 1000, // 5 minutes
  'analytics:retention': 15 * 60 * 1000, // 15 minutes — expensive full-table scan
  'analytics:platform-stats': 5 * 60 * 1000, // 5 minutes
};

export const DEFAULT_TTL_MS = 60 * 1000; // 1 minute
