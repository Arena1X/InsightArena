import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { BanGuard } from '../common/guards/ban.guard';
import { PredictionStatsDto } from './dto/prediction-stats.dto';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MarketsService } from './markets.service';
import { Market } from './entities/market.entity';
import { CreateMarketDto } from './dto/create-market.dto';
import {
  ListMarketsDto,
  PaginatedMarketsResponse,
} from './dto/list-markets.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';

@ApiTags('Markets')
@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get(':id/predictions')
  @Public()
  @ApiOperation({ summary: 'Get prediction statistics for a market' })
  @ApiResponse({
    status: 200,
    description: 'Prediction statistics by outcome (anonymous)',
    type: [PredictionStatsDto],
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketPredictions(
    @Param('id') id: string,
  ): Promise<PredictionStatsDto[]> {
    return this.marketsService.getPredictionStats(id);
  }

  @Post()
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new prediction market' })
  @ApiResponse({ status: 201, description: 'Market created', type: Market })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async createMarket(
    @Body() dto: CreateMarketDto,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.create(dto, user);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List and filter markets with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated markets list',
  })
  async listMarkets(
    @Query() query: ListMarketsDto,
  ): Promise<PaginatedMarketsResponse> {
    return this.marketsService.findAllFiltered(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Fetch market by ID or on-chain ID' })
  @ApiResponse({
    status: 200,
    description: 'Market with nested creator profile',
    type: Market,
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketById(@Param('id') id: string): Promise<Market> {
    return this.marketsService.findByIdOrOnChainId(id);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a prediction market' })
  @ApiResponse({ status: 200, description: 'Market cancelled', type: Market })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({
    status: 409,
    description: 'Market cannot be cancelled (already resolved)',
  })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async cancelMarket(@Param('id') id: string): Promise<Market> {
    return this.marketsService.cancelMarket(id);
  }
}
