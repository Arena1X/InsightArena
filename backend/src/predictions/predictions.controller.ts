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
} from '@nestjs/common';
import { BanGuard } from '../common/guards/ban.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PredictionsService } from './predictions.service';
import { SubmitPredictionDto } from './dto/submit-prediction.dto';
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { User } from '../users/entities/user.entity';
import { Prediction } from './entities/prediction.entity';
import {
  ClaimAllRewardsResponseDto,
  RewardsSummaryDto,
} from './dto/rewards-summary.dto';

@ApiTags('Predictions')
@ApiBearerAuth()
@Controller('predictions')
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Post()
  @UseGuards(BanGuard)
  @Idempotent()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a prediction on a market' })
  @ApiResponse({
    status: 201,
    description: 'Prediction submitted',
    type: Prediction,
  })
  @ApiResponse({
    status: 400,
    description: 'Market closed, invalid outcome, or missing Idempotency-Key',
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({
    status: 409,
    description:
      'Duplicate prediction on this market, or a request with the same Idempotency-Key is already in progress',
  })
  @ApiResponse({
    status: 422,
    description: 'Idempotency-Key reused with a different request body',
  })
  async submit(
    @Body() dto: SubmitPredictionDto,
    @CurrentUser() user: User,
  ): Promise<Prediction> {
    return this.predictionsService.submit(dto, user);
  }

  @Get('me')
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
