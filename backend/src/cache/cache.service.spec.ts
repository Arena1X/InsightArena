import { CacheService } from './cache.service';
import { CACHE_NAMESPACE_TTL_MS, DEFAULT_TTL_MS } from './cache.policy';

describe('CacheService', () => {
  let service: CacheService;
  let store: Map<string, unknown>;
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    store = new Map();
    cacheManager = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key))),
      set: jest.fn((key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      del: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    };
    service = new CacheService(cacheManager as never);
  });

  it('computes and caches on a cold key', async () => {
    const loader = jest.fn().mockResolvedValue('value-1');

    const result = await service.getOrSet('ns', 'key', loader);

    expect(result).toBe('value-1');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cacheManager.set).toHaveBeenCalledWith(
      'ns:key',
      'value-1',
      expect.any(Number),
    );
  });

  it('serves from cache without invoking the loader on a warm key', async () => {
    const loader = jest.fn().mockResolvedValue('value-1');

    await service.getOrSet('ns', 'key', loader);
    const second = await service.getOrSet('ns', 'key', loader);

    expect(second).toBe('value-1');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('single-flight: concurrent misses for the same key recompute exactly once', async () => {
    let resolveLoader: (value: string) => void;
    const loader = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    const call1 = service.getOrSet('ns', 'key', loader);
    const call2 = service.getOrSet('ns', 'key', loader);
    const call3 = service.getOrSet('ns', 'key', loader);

    // Let the microtask queue drain so all three calls reach the
    // single-flight check before the loader resolves.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // All three calls started before the loader resolved.
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader!('computed-once');
    const [r1, r2, r3] = await Promise.all([call1, call2, call3]);

    expect(r1).toBe('computed-once');
    expect(r2).toBe('computed-once');
    expect(r3).toBe('computed-once');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh recompute after the in-flight computation settles and the entry is invalidated', async () => {
    const loader = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await service.getOrSet('ns', 'key', loader);
    await service.invalidate('ns', 'key');
    const result = await service.getOrSet('ns', 'key', loader);

    expect(result).toBe('second');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('uses the configured namespace TTL when calling cacheManager.set', async () => {
    const loader = jest.fn().mockResolvedValue('v');

    await service.getOrSet('analytics:category', 'all', loader);

    expect(cacheManager.set).toHaveBeenCalledWith(
      'analytics:category:all',
      'v',
      CACHE_NAMESPACE_TTL_MS['analytics:category'],
    );
  });

  it('falls back to the default TTL for an unconfigured namespace', async () => {
    const loader = jest.fn().mockResolvedValue('v');

    await service.getOrSet('some:unlisted:namespace', 'key', loader);

    expect(cacheManager.set).toHaveBeenCalledWith(
      'some:unlisted:namespace:key',
      'v',
      DEFAULT_TTL_MS,
    );
  });

  it('invalidate removes the cached entry so the next call recomputes', async () => {
    const loader = jest
      .fn()
      .mockResolvedValueOnce('a')
      .mockResolvedValueOnce('b');

    await service.getOrSet('ns', 'key', loader);
    await service.invalidate('ns', 'key');
    const result = await service.getOrSet('ns', 'key', loader);

    expect(result).toBe('b');
    expect(cacheManager.del).toHaveBeenCalledWith('ns:key');
  });
});
