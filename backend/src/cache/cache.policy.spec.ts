import { CACHE_NAMESPACE_TTL_MS, DEFAULT_TTL_MS } from './cache.policy';

describe('cache.policy', () => {
  describe('CACHE_NAMESPACE_TTL_MS', () => {
    it('should be defined', () => {
      expect(CACHE_NAMESPACE_TTL_MS).toBeDefined();
    });

    it('should contain analytics namespace entries', () => {
      expect(CACHE_NAMESPACE_TTL_MS['analytics:category']).toBe(5 * 60 * 1000);
      expect(CACHE_NAMESPACE_TTL_MS['analytics:retention']).toBe(
        15 * 60 * 1000,
      );
      expect(CACHE_NAMESPACE_TTL_MS['analytics:platform-stats']).toBe(
        5 * 60 * 1000,
      );
    });

    it('should contain market analytics entries', () => {
      expect(CACHE_NAMESPACE_TTL_MS['analytics:market']).toBe(30 * 1000);
      expect(CACHE_NAMESPACE_TTL_MS['analytics:market-history']).toBe(
        60 * 1000,
      );
      expect(CACHE_NAMESPACE_TTL_MS['analytics:user-trends']).toBe(60 * 1000);
      expect(CACHE_NAMESPACE_TTL_MS['analytics:dashboard']).toBe(30 * 1000);
    });

    it('should contain public markets entry', () => {
      expect(CACHE_NAMESPACE_TTL_MS['public:markets']).toBe(60 * 1000);
    });

    it('should have analytics:category with 5 minute TTL', () => {
      expect(CACHE_NAMESPACE_TTL_MS['analytics:category']).toEqual(
        5 * 60 * 1000,
      );
    });

    it('should have analytics:retention with 15 minute TTL (expensive scan)', () => {
      expect(CACHE_NAMESPACE_TTL_MS['analytics:retention']).toEqual(
        15 * 60 * 1000,
      );
    });

    it('should have all TTL values as positive integers', () => {
      Object.values(CACHE_NAMESPACE_TTL_MS).forEach((ttl) => {
        expect(Number.isInteger(ttl)).toBe(true);
        expect(ttl).toBeGreaterThan(0);
      });
    });

    it('should follow millisecond convention consistently', () => {
      const secondValues = Object.values(CACHE_NAMESPACE_TTL_MS);
      // All values should be divisible by 1000 (represent whole seconds)
      secondValues.forEach((ms) => {
        expect(ms % 1000).toBe(0);
      });
    });

    it('should return same TTL for same namespace on multiple accesses', () => {
      const ttl1 = CACHE_NAMESPACE_TTL_MS['analytics:market'];
      const ttl2 = CACHE_NAMESPACE_TTL_MS['analytics:market'];
      expect(ttl1).toBe(ttl2);
    });
  });

  describe('DEFAULT_TTL_MS', () => {
    it('should be defined', () => {
      expect(DEFAULT_TTL_MS).toBeDefined();
    });

    it('should be 1 minute (60000 milliseconds)', () => {
      expect(DEFAULT_TTL_MS).toBe(60 * 1000);
    });

    it('should be 60000', () => {
      expect(DEFAULT_TTL_MS).toEqual(60000);
    });

    it('should be a positive integer', () => {
      expect(Number.isInteger(DEFAULT_TTL_MS)).toBe(true);
      expect(DEFAULT_TTL_MS).toBeGreaterThan(0);
    });

    it('should be greater than zero', () => {
      expect(DEFAULT_TTL_MS).toBeGreaterThan(0);
    });

    it('should match millisecond time unit', () => {
      expect(DEFAULT_TTL_MS).toBe(1000 * 60); // 1000ms per second * 60 seconds
    });
  });

  describe('TTL policies consistency', () => {
    it('should have shorter TTL for frequently changing data', () => {
      // Dashboard and market data should refresh more frequently
      const dashboardTtl = CACHE_NAMESPACE_TTL_MS['analytics:dashboard'];
      const marketTtl = CACHE_NAMESPACE_TTL_MS['analytics:market'];
      const retentionTtl = CACHE_NAMESPACE_TTL_MS['analytics:retention'];

      // Fresh data (30s) vs less frequently accessed (15min)
      expect(dashboardTtl).toBeLessThan(retentionTtl);
      expect(marketTtl).toBeLessThan(retentionTtl);
    });

    it('should have longer TTL for expensive operations', () => {
      // Retention uses expensive full-table scan
      const retentionTtl = CACHE_NAMESPACE_TTL_MS['analytics:retention'];
      const categoryTtl = CACHE_NAMESPACE_TTL_MS['analytics:category'];

      expect(retentionTtl).toBeGreaterThan(categoryTtl);
    });
  });
});
