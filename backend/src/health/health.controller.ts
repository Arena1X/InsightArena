import { Controller, Get, Query } from '@nestjs/common';
import { HealthCheckResult } from '@nestjs/terminus';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';
import { DetailedHealthDto, HealthSummaryDto } from './dto/detailed-health.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'All service checks passed',
  })
  @ApiResponse({
    status: 503,
    description: 'One or more service checks failed',
  })
  check(): Promise<HealthCheckResult> {
    return this.healthService.checkHealth();
  }

  @Get('ping')
  @Public()
  @ApiOperation({ summary: 'Simple ping check (used by health check)' })
  @ApiResponse({
    status: 200,
    description: 'Service is up',
  })
  checkPing() {
    return this.healthService.checkPing();
  }

  @Get('detailed')
  @Public()
  @ApiOperation({ summary: 'Detailed health status for monitoring' })
  @ApiQuery({
    name: 'verbose',
    required: false,
    type: Boolean,
    description:
      'When true, includes per-dependency status and latency. Defaults to a compact summary.',
  })
  @ApiResponse({
    status: 200,
    description: 'Health status, compact by default or detailed when verbose',
    type: DetailedHealthDto,
  })
  async checkDetailed(
    @Query('verbose') verbose?: string,
  ): Promise<DetailedHealthDto | HealthSummaryDto> {
    return this.healthService.checkDetailed(verbose === 'true');
  }
}
