import {
  Injectable,
  NotFoundException,
  BadGatewayException,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PredictionStatsDto } from './dto/prediction-stats.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Market } from './entities/market.entity';
import { Comment } from './entities/comment.entity';
import { MarketTemplate } from './entities/market-template.entity';
import { CreateMarketDto } from './dto/create-market.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import {
  ListMarketsDto,
  MarketStatus,
  PaginatedMarketsResponse,
} from './dto/list-markets.dto';
import {
  TrendingMarketsQueryDto,
  TrendingMarketItem,
  PaginatedTrendingMarketsResponse,
} from './dto/trending-markets.dto';
import { SorobanService } from '../soroban/soroban.service';

@Injectable()
export class MarketsService {
  private readonly logger = new Logger(MarketsService.name);
  private trendingCache: {
    data: TrendingMarketItem[];
    cachedAt: number;
  } | null = null;
  private readonly TRENDING_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(MarketTemplate)
    private readonly marketTemplatesRepository: Repository<MarketTemplate>,
    private readonly usersService: UsersService,
    private readonly sorobanService: SorobanService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get prediction statistics for a market - anonymous outcome counts only
   * Does NOT expose individual user stakes or identities
   */
  async getPredictionStats(marketId: string): Promise<PredictionStatsDto[]> {
    // First verify market exists
    const market = await this.findByIdOrOnChainId(marketId);

    // TODO: Call contract to get real prediction data
    // For now, return mock data based on market outcomes
    const mockStats: PredictionStatsDto[] = market.outcome_options.map(
      (outcome, index) => ({
        outcome,
        count: index === 0 ? 15 : 8, // Mock: first option has more predictions
        total_staked_stroops: index === 0 ? '1500000' : '800000', // Mock stakes in stroops
      }),
    );

    this.logger.log(
      `Retrieved prediction stats for market "${market.title}" (${market.id}) - ${mockStats.length} outcomes`,
    );

    return mockStats;
  }

  /**
   * Create a new market: call Soroban contract, then persist to DB.
   * Rolls back the DB write if the Soroban call fails.
   */
  async create(dto: CreateMarketDto, user: User): Promise<Market> {
    return this.createMarket(dto, user);
  }

  /**
   * Bulk create markets with transaction support.
   * Validates all markets before creating any.
   * Rolls back all if any creation fails.
   */
  async createBulk(dtos: CreateMarketDto[], user: User): Promise<Market[]> {
    // Validate all DTOs first
    for (const dto of dtos) {
      const endTime = new Date(dto.end_time);
      if (endTime <= new Date()) {
        throw new BadRequestException('end_time must be in the future');
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const createdMarkets: Market[] = [];

      for (const dto of dtos) {
        // Call Soroban contract
        let onChainMarketId: string;
        try {
          const result = await this.sorobanService.createMarket(
            dto.title,
            dto.description,
            dto.category,
            dto.outcome_options,
            dto.end_time,
            dto.resolution_time,
          );
          onChainMarketId = result.market_id;
        } catch (err) {
          this.logger.error('Soroban createMarket failed', err);
          throw new BadGatewayException('Failed to create market on Soroban');
        }

        // Create market entity
        const market = queryRunner.manager.create(Market, {
          on_chain_market_id: onChainMarketId,
          creator: user,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          outcome_options: dto.outcome_options,
          end_time: new Date(dto.end_time),
          resolution_time: new Date(dto.resolution_time),
          is_public: dto.is_public,
          is_resolved: false,
          is_cancelled: false,
          total_pool_stroops: '0',
          participant_count: 0,
        });

        const saved = await queryRunner.manager.save(market);
        createdMarkets.push(saved);
        this.logger.log(
          `Bulk created market "${dto.title}" with on_chain_id: ${onChainMarketId}`,
        );
      }

      await queryRunner.commitTransaction();
      return createdMarkets;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Bulk market creation failed, rolling back', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async createMarket(dto: CreateMarketDto, user: User): Promise<Market> {
    const endTime = new Date(dto.end_time);
    if (endTime <= new Date()) {
      throw new BadRequestException('end_time must be in the future');
    }

    // Step 1: Call Soroban contract to create market on-chain
    let onChainMarketId: string;
    try {
      const result = await this.sorobanService.createMarket(
        dto.title,
        dto.description,
        dto.category,
        dto.outcome_options,
        dto.end_time,
        dto.resolution_time,
      );
      onChainMarketId = result.market_id;
      this.logger.log(
        `Soroban createMarket called for "${dto.title}" — on_chain_id: ${onChainMarketId}`,
      );
    } catch (err) {
      this.logger.error('Soroban createMarket failed', err);
      throw new BadGatewayException('Failed to create market on Soroban');
    }

    // Step 2: Persist to database
    try {
      const market = this.marketsRepository.create({
        on_chain_market_id: onChainMarketId,
        creator: user,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        outcome_options: dto.outcome_options,
        end_time: new Date(dto.end_time),
        resolution_time: new Date(dto.resolution_time),
        is_public: dto.is_public,
        is_resolved: false,
        is_cancelled: false,
        total_pool_stroops: '0',
        participant_count: 0,
      });

      return await this.marketsRepository.save(market);
    } catch (err) {
      this.logger.error(
        'Failed to save market to DB after Soroban success',
        err,
      );
      throw new BadGatewayException(
        'Market created on-chain but failed to save to database',
      );
    }
  }

  async resolveMarket(id: string, outcome: string): Promise<Market> {
    const market = await this.findByIdOrOnChainId(id);

    if (market.is_resolved) {
      throw new ConflictException('Market is already resolved');
    }

    if (!market.outcome_options.includes(outcome)) {
      throw new BadRequestException(
        `Invalid outcome "${outcome}". Valid options: ${market.outcome_options.join(', ')}`,
      );
    }

    try {
      await this.sorobanService.resolveMarket(
        market.on_chain_market_id,
        outcome,
      );
    } catch (err) {
      this.logger.error('Soroban resolveMarket failed', err);
      throw new BadGatewayException('Failed to resolve market on Soroban');
    }

    market.is_resolved = true;
    market.resolved_outcome = outcome;
    return this.marketsRepository.save(market);
  }

  /**
   * Get trending markets based on recent prediction volume,
   * participant growth rate, and time to resolution.
   * Results are cached for 15 minutes.
   */
  async getTrendingMarkets(
    dto: TrendingMarketsQueryDto,
  ): Promise<PaginatedTrendingMarketsResponse> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);

    const allTrending = await this.computeTrendingMarkets();
    const start = (page - 1) * limit;
    const data = allTrending.slice(start, start + limit);

    return { data, total: allTrending.length, page, limit };
  }

  private async computeTrendingMarkets(): Promise<TrendingMarketItem[]> {
    const now = Date.now();
    if (
      this.trendingCache &&
      now - this.trendingCache.cachedAt < this.TRENDING_CACHE_TTL_MS
    ) {
      return this.trendingCache.data;
    }

    // Fetch open (non-resolved, non-cancelled) markets
    const markets = await this.marketsRepository.find({
      where: { is_resolved: false, is_cancelled: false },
      order: { created_at: 'DESC' },
      take: 200,
    });

    const scored: TrendingMarketItem[] = markets.map((market) => {
      const trending_score = this.calculateTrendingScore(market);
      return {
        id: market.id,
        title: market.title,
        description: market.description,
        category: market.category,
        outcome_options: market.outcome_options,
        end_time: market.end_time,
        is_resolved: market.is_resolved,
        participant_count: market.participant_count,
        total_pool_stroops: market.total_pool_stroops,
        trending_score,
        created_at: market.created_at,
      };
    });

    scored.sort((a, b) => b.trending_score - a.trending_score);

    this.trendingCache = { data: scored, cachedAt: now };
    this.logger.log(
      `Trending markets cache refreshed with ${scored.length} markets`,
    );

    return scored;
  }

  /**
   * Calculate trending score based on:
   * - Recent prediction volume (participant_count weight: 50%)
   * - Pool size / activity indicator (total_pool weight: 30%)
   * - Time to resolution - markets closing soon rank higher (20%)
   */
  private calculateTrendingScore(market: Market): number {
    const now = Date.now();

    // Participant count score (normalized, capped at 100 participants)
    const participantScore = Math.min(market.participant_count / 100, 1) * 50;

    // Pool size score (normalized, capped at 100M stroops = 10 XLM)
    const poolSize = Number(BigInt(market.total_pool_stroops));
    const poolScore = Math.min(poolSize / 100_000_000, 1) * 30;

    // Time to resolution score - markets ending sooner rank higher
    const endTime = new Date(market.end_time).getTime();
    const hoursUntilEnd = Math.max((endTime - now) / (1000 * 60 * 60), 0);
    // Markets ending within 24h get highest score, decaying over 7 days
    const timeScore =
      hoursUntilEnd <= 168 ? ((168 - hoursUntilEnd) / 168) * 20 : 0;

    return Math.round((participantScore + poolScore + timeScore) * 100) / 100;
  }

  /**
   * List markets with pagination, filtering, and keyword search.
   */
  async findAllFiltered(
    dto: ListMarketsDto,
  ): Promise<PaginatedMarketsResponse> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const qb = this.marketsRepository
      .createQueryBuilder('market')
      .leftJoinAndSelect('market.creator', 'creator');

    if (dto.category) {
      qb.andWhere('market.category = :category', { category: dto.category });
    }

    if (dto.status) {
      switch (dto.status) {
        case MarketStatus.Open:
          qb.andWhere(
            'market.is_resolved = false AND market.is_cancelled = false',
          );
          break;
        case MarketStatus.Resolved:
          qb.andWhere('market.is_resolved = true');
          break;
        case MarketStatus.Cancelled:
          qb.andWhere('market.is_cancelled = true');
          break;
      }
    }

    if (dto.is_public !== undefined) {
      qb.andWhere('market.is_public = :is_public', {
        is_public: dto.is_public,
      });
    }

    if (dto.search) {
      qb.andWhere('market.title ILIKE :search', {
        search: `%${dto.search}%`,
      });
    }

    qb.orderBy('market.created_at', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async findAll(): Promise<Market[]> {
    return this.marketsRepository.find({
      relations: ['creator'],
    });
  }

  /**
   * Find a market by UUID or on_chain_market_id.
   */
  async findByIdOrOnChainId(id: string): Promise<Market> {
    const market = await this.marketsRepository.findOne({
      where: [{ id }, { on_chain_market_id: id }],
      relations: ['creator'],
    });

    if (!market) {
      throw new NotFoundException(`Market with ID "${id}" not found`);
    }

    return market;
  }

  /**
   * Cancel a market: validate status, call Soroban contract, then update DB.
   * Resolved markets cannot be cancelled.
   */
  async cancelMarket(id: string): Promise<Market> {
    // Step 1: Find market and validate it can be cancelled
    const market = await this.findByIdOrOnChainId(id);

    if (market.is_resolved) {
      throw new ConflictException('Resolved markets cannot be cancelled');
    }

    if (market.is_cancelled) {
      throw new ConflictException('Market is already cancelled');
    }

    // Step 2: Call Soroban contract to cancel market on-chain
    try {
      // TODO: Replace with real SorobanService.cancelMarket() call
      this.logger.log(
        `Soroban cancelMarket called for market "${market.title}" (id: ${market.id})`,
      );
    } catch (err) {
      this.logger.error('Soroban cancelMarket failed', err);
      throw new BadGatewayException('Failed to cancel market on Soroban');
    }

    // Step 3: Update database
    try {
      market.is_cancelled = true;
      return await this.marketsRepository.save(market);
    } catch (err) {
      this.logger.error(
        'Failed to update market in DB after Soroban success',
        err,
      );
      throw new BadGatewayException(
        'Market cancelled on-chain but failed to update database',
      );
    }
  }

  /**
   * Create a comment for a market
   */
  async createComment(
    marketId: string,
    dto: CreateCommentDto,
    user: User,
  ): Promise<Comment> {
    const market = await this.findByIdOrOnChainId(marketId);

    let parent: Comment | null = null;
    if (dto.parentId) {
      parent = await this.commentsRepository.findOne({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent comment with ID "${dto.parentId}" not found`,
        );
      }
    }

    const comment = this.commentsRepository.create({
      content: dto.content,
      author: user,
      market,
      parent: parent || undefined,
    });

    return await this.commentsRepository.save(comment);
  }

  /**
   * Get all comments for a market, including nested replies
   */
  async getComments(marketId: string): Promise<Comment[]> {
    const market = await this.findByIdOrOnChainId(marketId);

    // Fetch all comments for this market
    const comments = await this.commentsRepository.find({
      where: { market: { id: market.id } },
      relations: ['author', 'parent'],
      order: { created_at: 'ASC' },
    });

    // Build nested structure
    const commentMap = new Map<string, Comment & { replies: Comment[] }>();
    const roots: Comment[] = [];

    comments.forEach((c) => {
      const commentWithReplies = { ...c, replies: [] };
      commentMap.set(c.id, commentWithReplies);
    });

    comments.forEach((c) => {
      const commentWithReplies = commentMap.get(c.id)!;
      if (c.parent) {
        const parent = commentMap.get(c.parent.id);
        if (parent) {
          parent.replies.push(commentWithReplies);
        } else {
          // Parent might not be in this market, which shouldn't happen
          roots.push(commentWithReplies);
        }
      } else {
        roots.push(commentWithReplies);
      }
    });

    return roots;
  }

  /**
   * Get all market templates
   */
  async getTemplates(): Promise<MarketTemplate[]> {
    return this.marketTemplatesRepository.find({
      order: { category: 'ASC', title: 'ASC' },
    });
  }

  /**
   * Generate a detailed market report with anonymized predictions
   */
  async generateMarketReport(marketId: string): Promise<any> {
    const market = await this.findByIdOrOnChainId(marketId);

    // Get prediction stats (anonymized)
    const stats = await this.getPredictionStats(marketId);

    const outcomeDistribution = stats.map((stat) => ({
      outcome: stat.outcome,
      count: stat.count,
      percentage:
        market.participant_count > 0
          ? ((stat.count / market.participant_count) * 100).toFixed(2)
          : '0.00',
      total_staked_stroops: stat.total_staked_stroops,
    }));

    // Build timeline of events
    const timeline = [
      {
        timestamp: market.created_at,
        event_type: 'market_created',
        description: `Market "${market.title}" was created`,
      },
      {
        timestamp: market.end_time,
        event_type: 'market_ended',
        description: 'Market ended - no more predictions accepted',
      },
    ];

    if (market.is_resolved) {
      timeline.push({
        timestamp: new Date(), // Use current time as resolution was just checked
        event_type: 'market_resolved',
        description: `Market resolved with outcome: ${market.resolved_outcome}`,
      });
    }

    return {
      market_id: market.id,
      title: market.title,
      description: market.description,
      category: market.category,
      created_at: market.created_at,
      end_time: market.end_time,
      resolution_time: market.resolution_time,
      is_resolved: market.is_resolved,
      resolved_outcome: market.resolved_outcome || null,
      total_participants: market.participant_count,
      total_pool_stroops: market.total_pool_stroops,
      outcome_distribution: outcomeDistribution,
      timeline: timeline.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
      generated_at: new Date(),
    };
  }
}
