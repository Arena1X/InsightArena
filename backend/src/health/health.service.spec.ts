import { HealthService } from './health.service';

describe('HealthService - checkDetailed', () => {
  let dataSource: { query: jest.Mock };
  let cacheManager: { set: jest.Mock; get: jest.Mock };
  let service: HealthService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    cacheManager = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue('ok'),
    };
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    service = new HealthService(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      dataSource as never,
      cacheManager as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports healthy when database, soroban, and cache are all up', async () => {
    const result = await service.checkDetailed(true);

    expect(result.status).toBe('healthy');
    expect('database' in result && result.database.status).toBe('up');
    expect('soroban' in result && result.soroban.status).toBe('up');
    expect('cache' in result && result.cache.status).toBe('up');
  });

  it('reports down when the database is unreachable', async () => {
    dataSource.query.mockRejectedValue(new Error('connection refused'));

    const result = await service.checkDetailed(true);

    expect(result.status).toBe('down');
    expect('database' in result && result.database.status).toBe('down');
  });

  it('reports degraded when soroban RPC fails but the database is up', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    const result = await service.checkDetailed(true);

    expect(result.status).toBe('degraded');
    expect('soroban' in result && result.soroban.status).toBe('down');
    expect('database' in result && result.database.status).toBe('up');
  });

  it('reports degraded when soroban RPC responds with a non-ok status', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const result = await service.checkDetailed(true);

    expect(result.status).toBe('degraded');
    expect('soroban' in result && result.soroban.status).toBe('degraded');
  });

  it('reports degraded when the cache is unreachable but the database is up', async () => {
    cacheManager.get.mockResolvedValue(undefined);

    const result = await service.checkDetailed(true);

    expect(result.status).toBe('degraded');
    expect('cache' in result && result.cache.status).toBe('down');
  });

  it('prioritizes down over degraded when both the database and a non-critical dependency fail', async () => {
    dataSource.query.mockRejectedValue(new Error('connection refused'));
    fetchMock.mockRejectedValue(new Error('timeout'));

    const result = await service.checkDetailed(true);

    expect(result.status).toBe('down');
  });

  it('omits per-dependency detail when verbose is not requested', async () => {
    const result = await service.checkDetailed();

    expect(result).toEqual({
      status: 'healthy',
      uptime_seconds: expect.any(Number),
    });
    expect('database' in result).toBe(false);
    expect('soroban' in result).toBe(false);
    expect('cache' in result).toBe(false);
  });

  it('includes per-dependency status and latency when verbose is requested', async () => {
    const result = await service.checkDetailed(true);

    expect('database' in result && result.database).toEqual({
      status: 'up',
      latency_ms: expect.any(Number),
    });
    expect('soroban' in result && result.soroban).toEqual({
      status: 'up',
      latency_ms: expect.any(Number),
    });
    expect('cache' in result && result.cache).toEqual({
      status: 'up',
      latency_ms: expect.any(Number),
    });
  });
});
