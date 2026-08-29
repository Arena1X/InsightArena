import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Response } from 'express';
import { BanGuard } from '../common/guards/ban.guard';
import { PredictionsRateLimitGuard } from '../common/guards/predictions-rate-limit.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ThrottleTier } from '../common/decorators/throttle-tier.decorator';
import { PredictionsService } from './predictions.service';
import { SubmitPredictionDto } from './dto/submit-prediction.dto';
import { SubmitPredictionResponseDto } from './dto/submit-prediction-response.dto';
import { SubmitBatchPredictionsDto } from './dto/submit-batch-prediction.dto';
import { BatchSubmitResponseDto } from './dto/batch-submit-response.dto';
import { UpdatePredictionNoteDto } from './dto/update-prediction-note.dto';
import {
  ListMyPredictionsDto,
  PaginatedMyPredictionsResponse,
  PredictionWithStatus,
} from './dto/list-my-predictions.dto';
import {
  ListMarketPredictionsDto,
  PaginatedMarketPredictionsResponse,
  PaginatedMarketPredictionsResponseDto,
} from './dto/list-market-predictions.dto';
import { ExportPredictionsDto } from './dto/export-predictions.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { User } from '../users/entities/user.entity';
import { Prediction } from './entities/prediction.entity';
import {
  ClaimAllRewardsResponseDto,
  RewardsSummaryDto,
} from './dto/rewards-summary.dto';
import { PnlQueryDto, PnlResponseDto } from './dto/pnl-query.dto';
import { PredictionsExceptionFilter } from './filters/predictions-exception.filter';

@ApiTags('Predictions')
@ApiBearerAuth()
@Controller('predictions')
@UseFilters(PredictionsExceptionFilter)
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Post()
  @UseGuards(BanGuard, PredictionsRateLimitGuard)
  @Idempotent()
  @ThrottleTier('write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Submit a prediction on a market with optional slippage protection',
  })
  @ApiResponse({
    status: 201,
    description: 'Prediction submitted with realized price and shares',
    type: SubmitPredictionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Market closed, invalid outcome, or missing Idempotency-Key',
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({
    status: 409,
    description:
      'Duplicate prediction on this market, slippage exceeded, a request with the same Idempotency-Key already in progress, or the same Idempotency-Key reused with a different request body',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded for prediction submissions',
  })
  async submit(
    @Body() dto: SubmitPredictionDto,
    @CurrentUser() user: User,
  ): Promise<SubmitPredictionResponseDto> {
    return this.predictionsService.submit(dto, user);
  }

  @Post('batch')
  @UseGuards(BanGuard, PredictionsRateLimitGuard)
  @Idempotent()
  @ThrottleTier('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Submit a batch (slip) of predictions in one validated call. Atomic by default - the whole slip is rejected if any item fails.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Per-item results. In non-atomic mode valid items are submitted and failures are reported per item; in atomic mode a failure yields HTTP 400 with per-item errors and nothing is persisted.',
    type: BatchSubmitResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed (atomic mode), invalid payload, or missing Idempotency-Key',
  })
  @ApiResponse({
    status: 409,
    description:
      'A request with the same Idempotency-Key is already in progress, or it was reused with a different request body',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded for prediction submissions',
  })
  async submitBatch(
    @Body() dto: SubmitBatchPredictionsDto,
    @CurrentUser() user: User,
  ): Promise<BatchSubmitResponseDto> {
    return this.predictionsService.submitBatch(dto, user);
  }

  @Get('me')
  @ThrottleTier('read')
  @ApiOperation({ summary: "Get the authenticated user's predictions" })
  @ApiResponse({
    status: 200,
    description: 'Paginated predictions with market data',
  })
  async getMyPredictions(
    @Query() query: ListMyPredictionsDto,
    @CurrentUser() user: User,
  ): Promise<PaginatedMyPredictionsResponse> {
    return this.predictionsService.findMine(user, query);
  }

  @Get('rewards/summary')
  @ThrottleTier('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get the authenticated user's claimable and vesting rewards",
  })
  @ApiResponse({
    status: 200,
    description: 'Claimable, vesting, and total-earned balances in XLM',
    type: RewardsSummaryDto,
  })
  async getRewardsSummary(
    @CurrentUser() user: User,
  ): Promise<RewardsSummaryDto> {
    return this.predictionsService.getRewardsSummary(user);
  }

  @Post('rewards/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Claim all of the authenticated user's currently claimable rewards",
  })
  @ApiResponse({
    status: 200,
    description: 'Rewards claimed; returns the refreshed summary',
    type: ClaimAllRewardsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'No claimable rewards' })
  async claimAllRewards(
    @CurrentUser() user: User,
  ): Promise<ClaimAllRewardsResponseDto> {
    return this.predictionsService.claimAllRewards(user);
  }

  @Get('pnl')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get the authenticated user's realized and unrealized P&L",
    description:
      'Returns realized P&L (from settled predictions) and unrealized P&L ' +
      '(from open positions at current implied odds). Supports time filtering ' +
      'via `from`/`to` and an optional per-market breakdown via `breakdown=true`.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Aggregate realized/unrealized P&L, with an optional per-market breakdown',
  })
  async getPnl(
    @Query() query: PnlQueryDto,
    @CurrentUser() user: User,
  ): Promise<PnlResponseDto> {
    return this.predictionsService.getPnl(user, query);
  }

  @Get('export')
  @ThrottleTier('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Export the authenticated user's prediction history as CSV",
  })
  @ApiResponse({
    status: 200,
    description: 'CSV file stream',
    content: { 'text/csv': {} },
  })
  async exportPredictions(
    @Query() query: ExportPredictionsDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="predictions-${dateStr}.csv"`,
    );

    const stream = this.predictionsService.exportCsv(user, query);
    stream.pipe(res);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a single prediction by ID' })
  @ApiResponse({
    status: 200,
    description: 'Prediction with enriched status',
    type: Prediction,
  })
  @ApiResponse({
    status: 403,
    description: 'Not authorized to view this prediction',
  })
  @ApiResponse({ status: 404, description: 'Prediction not found' })
  async getPredictionById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<PredictionWithStatus> {
    return this.predictionsService.findById(id, user.id);
  }

  @Patch(':id/note')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update personal note on a prediction' })
  @ApiResponse({
    status: 200,
    description: 'Prediction note updated',
    type: Prediction,
  })
  @ApiResponse({
    status: 404,
    description: 'Prediction not found or not owned by user',
  })
  async updateNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePredictionNoteDto,
    @CurrentUser() user: User,
  ): Promise<Prediction> {
    return this.predictionsService.updateNote(id, dto, user);
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim payout for a winning prediction' })
  @ApiResponse({
    status: 200,
    description: 'Payout claimed successfully',
    type: Prediction,
  })
  @ApiResponse({
    status: 400,
    description: 'Market not resolved, prediction lost, or already claimed',
  })
  @ApiResponse({
    status: 404,
    description: 'Prediction not found or not owned by user',
  })
  async claimPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Prediction> {
    return this.predictionsService.claim(id, user);
  }

  @Public()
  @Get('market/:marketId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated, anonymized predictions for a market (public)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated, anonymized predictions list',
    type: PaginatedMarketPredictionsResponseDto,
  })
  async getMarketPredictions(
    @Param('marketId', ParseUUIDPipe) marketId: string,
    @Query() query: ListMarketPredictionsDto,
  ): Promise<PaginatedMarketPredictionsResponse> {
    return this.predictionsService.findByMarket(marketId, query);
  }
}
