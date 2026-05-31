import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiBody,
} from '@nestjs/swagger';
import { OracleService } from './oracle.service';
import { OracleAuthGuard } from './guards/oracle-auth.guard';
import { WebhookAuthGuard } from './guards/webhook-auth.guard';
import {
  ListPendingMatchesQueryDto,
  PaginatedPendingMatchesResponse,
} from './dto/list-pending-matches-query.dto';
import {
  WebhookMatchResultDto,
  WebhookResponseDto,
} from './dto/webhook-match-result.dto';
import { WebhookService } from './webhook.service';
import { SubmissionHistoryService } from './submission-history.service';
import {
  GetSubmissionsQueryDto,
  PaginatedSubmissionsResponse,
} from './dto/submission-history.dto';

@ApiTags('Oracle')
@Controller('oracle')
export class OracleController {
  constructor(
    private readonly oracleService: OracleService,
    private readonly webhookService: WebhookService,
    private readonly submissionHistoryService: SubmissionHistoryService,
  ) {}

  @Get('pending-matches')
  @UseGuards(OracleAuthGuard)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Get pending matches that need results submitted' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of matches needing results',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid API key' })
  async getPendingMatches(
    @Query() query: ListPendingMatchesQueryDto,
  ): Promise<PaginatedPendingMatchesResponse> {
    return this.oracleService.getPendingMatches(query);
  }

  @Post('webhooks/match-result')
  @UseGuards(WebhookAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiSecurity('webhook-signature')
  @ApiOperation({ summary: 'Submit match result via webhook' })
  @ApiBody({ type: WebhookMatchResultDto })
  @ApiResponse({
    status: 202,
    description: 'Match result accepted and queued for submission',
    type: WebhookResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid signature' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({
    status: 409,
    description: 'Match already resolved or not started',
  })
  async submitMatchResult(
    @Body() dto: WebhookMatchResultDto,
  ): Promise<WebhookResponseDto> {
    return this.webhookService.processMatchResult(dto);
  }

  @Get('submissions')
  @UseGuards(OracleAuthGuard)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Get oracle submission history and statistics' })
  @ApiResponse({
    status: 200,
    description: 'Paginated submission history with statistics',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid API key' })
  async getSubmissions(
    @Query() query: GetSubmissionsQueryDto,
  ): Promise<PaginatedSubmissionsResponse> {
    return this.submissionHistoryService.getSubmissions(query);
  }
}
