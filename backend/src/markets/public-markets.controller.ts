import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Public } from '../common/decorators/public.decorator';
import { Scopes } from '../common/decorators/scopes.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ListMarketsDto } from './dto/list-markets.dto';
import {
  PaginatedPublicMarketsResponseDto,
  PublicMarketResponseDto,
} from './dto/public-market-response.dto';
import { Market } from './entities/market.entity';
import { MarketsService } from './markets.service';

@ApiTags('Public API')
@ApiSecurity('public-api-key')
@Controller('public/markets')
@Public()
@UseGuards(ApiKeyGuard)
@Scopes('public:read')
@SkipThrottle({ default: true, auth: true })
@Throttle({ public: {} })
export class PublicMarketsController {
  private readonly PUBLIC_MARKETS_CACHE_KEY = 'public:markets:list';
  private readonly PUBLIC_MARKET_DETAIL_CACHE_KEY_PREFIX =
    'public:markets:detail:';
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(
    private readonly marketsService: MarketsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List public markets',
    description:
      'Public API tier endpoint. Requires an X-API-Key with the public:read scope.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated public markets with sensitive fields omitted',
    type: PaginatedPublicMarketsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key lacks public:read scope' })
  @ApiResponse({ status: 429, description: 'Public API rate limit exceeded' })
  async list(
    @Query() query: ListMarketsDto,
  ): Promise<PaginatedPublicMarketsResponseDto> {
    // Generate cache key based on query parameters
    const cacheKey = `${this.PUBLIC_MARKETS_CACHE_KEY}:${JSON.stringify(query)}`;

    // Try to get from cache
    const cached =
      await this.cacheManager.get<PaginatedPublicMarketsResponseDto>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const result = await this.marketsService.findAllFiltered({
      ...query,
      is_public: true,
    });

    const response = {
      ...result,
      data: (result.data as Market[]).map((market) =>
        PublicMarketResponseDto.fromEntity(market),
      ),
    };

    // Store in cache with TTL
    await this.cacheManager.set(cacheKey, response, this.CACHE_TTL_MS);

    return response;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a public market',
    description:
      'Public API tier endpoint. Requires an X-API-Key with the public:read scope.',
  })
  @ApiResponse({
    status: 200,
    description: 'Public market with sensitive fields omitted',
    type: PublicMarketResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key lacks public:read scope' })
  @ApiResponse({ status: 404, description: 'Public market not found' })
  @ApiResponse({ status: 429, description: 'Public API rate limit exceeded' })
  async get(@Param('id') id: string): Promise<PublicMarketResponseDto> {
    const cacheKey = `${this.PUBLIC_MARKET_DETAIL_CACHE_KEY_PREFIX}${id}`;

    // Try to get from cache
    const cached =
      await this.cacheManager.get<PublicMarketResponseDto>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const market = await this.marketsService.findByIdOrOnChainId(id);
    if (!market.is_public) {
      throw new NotFoundException(`Public market with ID "${id}" not found`);
    }

    const response = PublicMarketResponseDto.fromEntity(market);

    // Store in cache with TTL
    await this.cacheManager.set(cacheKey, response, this.CACHE_TTL_MS);

    return response;
  }
}
