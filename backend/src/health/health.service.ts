import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import * as os from 'os';
import { DataSource } from 'typeorm';
import { DetailedHealthDto, HealthSummaryDto } from './dto/detailed-health.dto';

const START_TIME = Date.now();
const CACHE_PROBE_KEY = '__health_check_probe__';

/**
 * Per-dependency probe timeouts. Each dependency check is bounded by its own
 * timeout so a single slow dependency (e.g. a hung DB connection or an
 * unresponsive Soroban RPC) is reported as unhealthy instead of stalling the
 * whole health response.
 */
export const DATABASE_PROBE_TIMEOUT_MS = 2000;
export const SOROBAN_PROBE_TIMEOUT_MS = 5000;
export const CACHE_PROBE_TIMEOUT_MS = 2000;

/**
 * Upper bound on how long checkDetailed/checkReadiness can take. Probes run in
 * parallel, so the aggregate is the slowest individual probe timeout.
 */
export const HEALTH_AGGREGATE_TIMEOUT_MS = Math.max(
  DATABASE_PROBE_TIMEOUT_MS,
  SOROBAN_PROBE_TIMEOUT_MS,
  CACHE_PROBE_TIMEOUT_MS,
);

type DependencyStatus = { status: string; latency_ms: number; error?: string };

class ProbeTimeoutError extends Error {}

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly db: TypeOrmHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Run comprehensive health checks:
   * 1. HTTP check (self)
   * 2. Database connectivity (TypeORM)
   * 3. Disk storage availability
   *
   * Returns 200 OK when all checks pass
   * Returns 503 Service Unavailable when any check fails
   */
  @HealthCheck()
  async checkHealth(): Promise<HealthCheckResult> {
    const port = process.env.PORT ?? 3000;
    const baseUrl = `http://localhost:${port}/api/v1/health/ping`;

    return await this.health.check([
      () =>
        this.http.pingCheck('http', baseUrl, {
          timeout: 5000,
        }),
      () => this.db.pingCheck('database', { connection: this.dataSource }),
      () =>
        this.disk.checkStorage('storage', {
          path: os.tmpdir(),
          thresholdPercent: 90,
        }),
    ]);
  }

  /**
   * Simple endpoint for HTTP health check (no recursion)
   * Used by the main health check to ping the service
   */
  checkPing() {
    return {
      status: 'ok',
      type: 'ping',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detailed health check with individual component status and latency for monitoring.
   * Probes the database, Soroban RPC, and cache independently and in parallel,
   * each bounded by its own timeout, so the response always returns within
   * HEALTH_AGGREGATE_TIMEOUT_MS even if a dependency hangs.
   *
   * The database is treated as a critical dependency: its failure brings the
   * overall status to 'down'. Soroban RPC and cache are non-critical: their
   * failure only degrades the overall status, since the API can still serve
   * most traffic without them.
   *
   * @param verbose When false (default), returns only the overall status and
   * uptime. When true, includes per-dependency status and latency.
   */
  async checkDetailed(
    verbose = false,
  ): Promise<DetailedHealthDto | HealthSummaryDto> {
    const [dbResult, sorobanResult, cacheResult] = await Promise.all([
      this.checkDatabase(),
      this.checkSoroban(),
      this.checkCache(),
    ]);

    const status = this.computeOverallStatus(
      dbResult,
      sorobanResult,
      cacheResult,
    );
    const uptime_seconds = Math.floor((Date.now() - START_TIME) / 1000);

    if (!verbose) {
      return { status, uptime_seconds };
    }

    return {
      status,
      database: dbResult,
      soroban: sorobanResult,
      cache: cacheResult,
      uptime_seconds,
    };
  }

  /**
   * Liveness: is the process itself up and able to respond? No dependency
   * checks — a dependency outage must not cause an orchestrator to restart
   * an otherwise-healthy process.
   */
  checkLiveness(): { status: 'ok'; uptime_seconds: number } {
    return {
      status: 'ok',
      uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
    };
  }

  /**
   * Readiness: can this instance actually serve traffic right now? Probes
   * DB, Soroban RPC, and cache; any dependency being down flips readiness
   * to not-ready (503), signalling the orchestrator to stop routing traffic
   * here until dependencies recover.
   */
  async checkReadiness(): Promise<DetailedHealthDto> {
    const [dbResult, sorobanResult, cacheResult] = await Promise.all([
      this.checkDatabase(),
      this.checkSoroban(),
      this.checkCache(),
    ]);

    const ready =
      dbResult.status === 'up' &&
      sorobanResult.status === 'up' &&
      cacheResult.status === 'up';

    const body: DetailedHealthDto = {
      status: ready ? 'healthy' : 'down',
      database: dbResult,
      soroban: sorobanResult,
      cache: cacheResult,
      uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
    };

    if (!ready) {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }

  private computeOverallStatus(
    database: DependencyStatus,
    soroban: DependencyStatus,
    cache: DependencyStatus,
  ): 'healthy' | 'degraded' | 'down' {
    if (database.status !== 'up') {
      return 'down';
    }
    if (soroban.status !== 'up' || cache.status !== 'up') {
      return 'degraded';
    }
    return 'healthy';
  }

  async checkDatabase(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      await this.withTimeout(
        this.dataSource.query('SELECT 1'),
        DATABASE_PROBE_TIMEOUT_MS,
        'database probe timed out',
      );
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (error) {
      return {
        status: 'down',
        latency_ms: Date.now() - start,
        error: this.describeProbeError(error, 'database query failed'),
      };
    }
  }

  async checkSoroban(): Promise<DependencyStatus> {
    const rpcUrl =
      process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
    const start = Date.now();
    const controller = new AbortController();
    try {
      // Abort the underlying request on timeout so it does not linger, and
      // race it against the timer in case the fetch ignores the signal.
      const response = await this.withTimeout(
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getHealth',
            params: [],
          }),
          signal: controller.signal,
        }),
        SOROBAN_PROBE_TIMEOUT_MS,
        'soroban probe timed out',
        () => controller.abort(),
      );
      const latency = Date.now() - start;
      return { status: response.ok ? 'up' : 'degraded', latency_ms: latency };
    } catch (error) {
      return {
        status: 'down',
        latency_ms: Date.now() - start,
        error: this.describeProbeError(error, 'soroban rpc unreachable'),
      };
    }
  }

  /**
   * Round-trips a probe value through the cache to verify it is reachable.
   * The probe is bounded by CACHE_PROBE_TIMEOUT_MS so a hung connection
   * cannot stall checkDetailed/checkReadiness indefinitely. A timeout is
   * reported as unhealthy with a distinct reason from a connection-refused
   * failure.
   */
  async checkCache(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      const value = await this.withTimeout(
        (async () => {
          await this.cacheManager.set(CACHE_PROBE_KEY, 'ok', 5000);
          return this.cacheManager.get(CACHE_PROBE_KEY);
        })(),
        CACHE_PROBE_TIMEOUT_MS,
        'cache probe timed out',
      );
      return {
        status: value === 'ok' ? 'up' : 'down',
        latency_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        latency_ms: Date.now() - start,
        error: this.describeProbeError(error, 'cache connection refused'),
      };
    }
  }

  /** Distinguishes a probe timeout from any other dependency failure. */
  private describeProbeError(error: unknown, fallback: string): string {
    return error instanceof ProbeTimeoutError ? error.message : fallback;
  }

  /**
   * Rejects with a ProbeTimeoutError if the promise does not settle within
   * `ms`. The optional `onTimeout` hook lets callers cancel the underlying
   * work (e.g. abort an in-flight fetch).
   */
  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string,
    onTimeout?: () => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        onTimeout?.();
        reject(new ProbeTimeoutError(message));
      }, ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
