import {
  DEFAULT_FLAG_EVALUATION_CACHE_TTL_MS,
  FlagEvaluationCacheService,
} from './flag-evaluation-cache.service';
import { ResolvedFlagDto } from './feature-flags.service';

describe('FlagEvaluationCacheService', () => {
  let cacheService: FlagEvaluationCacheService;

  const mockResolvedFlag = (
    key: string,
    isEnabled = true,
  ): ResolvedFlagDto => ({
    key,
    name: `Flag ${key}`,
    is_enabled: isEnabled,
    targeting_type: null,
    targeting_rules: null,
  });

  beforeEach(() => {
    cacheService = new FlagEvaluationCacheService(1000); // 1-second TTL for testing
  });

  describe('Freshness bounds and TTL', () => {
    it('unchanged flags are served from cache within TTL', () => {
      const flag = mockResolvedFlag('new_feature', true);
      cacheService.set('new_feature', 'user-1', flag);

      const cached = cacheService.get('new_feature', 'user-1');
      expect(cached).toBeDefined();
      expect(cached?.is_enabled).toBe(true);
    });

    it('a flag evaluation expires after TTL bound', async () => {
      const shortTtlCache = new FlagEvaluationCacheService(50); // 50ms TTL
      const flag = mockResolvedFlag('new_feature', true);
      shortTtlCache.set('new_feature', 'user-1', flag);

      expect(shortTtlCache.get('new_feature', 'user-1')).toBeDefined();

      // Wait past TTL bound
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Stale entry should be expired and return undefined
      expect(shortTtlCache.get('new_feature', 'user-1')).toBeUndefined();
    });

    it('a flag update reflects immediately upon invalidation', () => {
      const oldFlag = mockResolvedFlag('beta_feature', false);
      cacheService.set('beta_feature', 'user-1', oldFlag);
      cacheService.set('beta_feature', 'user-2', oldFlag);

      // Verify cached
      expect(cacheService.get('beta_feature', 'user-1')?.is_enabled).toBe(false);

      // Update happens -> invalidate flag key
      cacheService.invalidate('beta_feature');

      // Evaluator now has cache miss and can serve updated flag value
      expect(cacheService.get('beta_feature', 'user-1')).toBeUndefined();
      expect(cacheService.get('beta_feature', 'user-2')).toBeUndefined();

      const updatedFlag = mockResolvedFlag('beta_feature', true);
      cacheService.set('beta_feature', 'user-1', updatedFlag);
      expect(cacheService.get('beta_feature', 'user-1')?.is_enabled).toBe(true);
    });

    it('cache miss falls back to undefined so caller can perform correct evaluation', () => {
      // For un-cached key
      const result = cacheService.get('non_existent', 'user-1');
      expect(result).toBeUndefined();
    });

    it('user invalidation clears entries for specific user only', () => {
      cacheService.set('flag_a', 'user-1', mockResolvedFlag('flag_a'));
      cacheService.set('flag_b', 'user-1', mockResolvedFlag('flag_b'));
      cacheService.set('flag_a', 'user-2', mockResolvedFlag('flag_a'));

      cacheService.invalidateUser('user-1');

      expect(cacheService.get('flag_a', 'user-1')).toBeUndefined();
      expect(cacheService.get('flag_b', 'user-1')).toBeUndefined();
      expect(cacheService.get('flag_a', 'user-2')).toBeDefined();
    });

    it('clear() invalidates all cached evaluations', () => {
      cacheService.set('flag_a', 'user-1', mockResolvedFlag('flag_a'));
      cacheService.set('flag_b', 'user-2', mockResolvedFlag('flag_b'));

      cacheService.clear();

      expect(cacheService.size()).toBe(0);
      expect(cacheService.get('flag_a', 'user-1')).toBeUndefined();
    });

    it('uses documented default TTL constant of 60 seconds', () => {
      expect(DEFAULT_FLAG_EVALUATION_CACHE_TTL_MS).toBe(60_000);
      const defaultService = new FlagEvaluationCacheService();
      expect(defaultService).toBeDefined();
    });
  });
});
