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
}
