import { Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { IndexerHealthService } from './health.service';
import { ReconciliationService } from './reconciliation.service';
import {
  IndexerDashboardDto,
  IndexerHealthResponseDto,
  ReconciliationStatusDto,
} from './dto/indexer-health.dto';

@ApiTags('Indexer')
@Controller('indexer')
export class IndexerHealthController {
  constructor(
    private readonly healthService: IndexerHealthService,
    private readonly reconciliationService: ReconciliationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * GET /api/indexer/health
   * #722 — Indexer health metrics and alerting status.
   */
  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Get indexer health status and metrics' })
  @ApiResponse({
    status: 200,
    description: 'Indexer health with alerts',
    type: IndexerHealthResponseDto,
  })
  getHealth(): Promise<IndexerHealthResponseDto> {
    return this.healthService.getHealth();
  }

  /**
   * GET /api/indexer/health/dashboard
   * #722 — Real-time indexer dashboard stats.
   */
  @Get('health/dashboard')
  @Public()
  @ApiOperation({ summary: 'Get indexer dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Extended indexer dashboard data',
    type: IndexerDashboardDto,
  })
  getDashboard(): Promise<IndexerDashboardDto> {
    return this.healthService.getDashboard();
  }

  /**
   * GET /api/indexer/health/prometheus
   * #722 — Prometheus metrics export for the indexer.
   */
  @Get('health/prometheus')
  @Public()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiProduces('text/plain')
  @ApiOperation({ summary: 'Export indexer metrics in Prometheus format' })
  @ApiResponse({
    status: 200,
    description: 'Prometheus text exposition format',
  })
  getPrometheusMetrics(): Promise<string> {
    return this.healthService.getPrometheusMetrics();
  }

  @Get('health/reconciliation')
  @Public()
  @ApiOperation({ summary: 'Get reconciliation status and lag' })
  @ApiResponse({
    status: 200,
    description: 'Reconciliation status with non-negative lag',
    type: ReconciliationStatusDto,
  })
  async getReconciliationStatus(): Promise<ReconciliationStatusDto> {
    const status = this.reconciliationService.getStatus();
    const contractId = this.configService.get<string>('SOROBAN_CONTRACT_ID');
    let lag = 0;

    if (contractId && contractId !== 'your-contract-id-here') {
      const checkpoint =
        await this.reconciliationService.getCheckpointForContract(contractId);
      if (checkpoint) {
        lag = Math.max(
          0,
          Number(checkpoint.chain_head_ledger) -
            Number(checkpoint.last_indexed_ledger),
        );
      }
    }

    return {
      ...status,
      lag_in_ledgers: lag,
    };
  }

  /**
   * POST /api/indexer/health/sync
   * #722 — Manually trigger an indexer sync (admin only).
   */
  @Post('health/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually trigger indexer sync (admin only)' })
  @ApiResponse({ status: 200, description: 'Sync triggered' })
  triggerSync(): Promise<{ message: string }> {
    return this.healthService.triggerManualSync();
  }
}
