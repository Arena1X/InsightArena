import { Controller, Get } from '@nestjs/common';
import { HealthCheckResult } from '@nestjs/terminus';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

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
}
