import { Injectable } from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import * as os from 'os';
import { DataSource } from 'typeorm';
import { DetailedHealthDto } from './dto/detailed-health.dto';

const START_TIME = Date.now();

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly db: TypeOrmHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
   * Checks database connectivity, Soroban RPC reachability, and cache status.
   */
  async checkDetailed(): Promise<DetailedHealthDto> {
    const [dbResult, sorobanResult] = await Promise.all([
      this.checkDatabase(),
      this.checkSoroban(),
    ]);

    const overallStatus =
      dbResult.status === 'down'
        ? 'down'
        : dbResult.status === 'degraded' || sorobanResult.status === 'degraded'
          ? 'degraded'
          : 'healthy';

    return {
      status: overallStatus,
      database: dbResult,
      soroban: sorobanResult,
      cache: this.getCacheStatus(),
      uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
    };
  }

  private async checkDatabase(): Promise<{
    status: string;
    latency_ms: number;
  }> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latency_ms: Date.now() - start };
    } catch {
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  private async checkSoroban(): Promise<{
    status: string;
    latency_ms: number;
  }> {
    const rpcUrl =
      process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getHealth',
          params: [],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latency = Date.now() - start;
      return { status: response.ok ? 'up' : 'degraded', latency_ms: latency };
    } catch {
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  /** Cache is in-memory (challenge cache); always 'up'. Hit rate is not tracked externally. */
  private getCacheStatus(): { status: string; hit_rate: number } {
    return { status: 'up', hit_rate: 0 };
  }
}
