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
import { Repository } from 'typeorm';
import { Market } from './entities/market.entity';
import { CreateMarketDto } from './dto/create-market.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import {
  ListMarketsDto,
  MarketStatus,
  PaginatedMarketsResponse,
} from './dto/list-markets.dto';
import { SorobanService } from '../soroban/soroban.service';

@Injectable()
export class MarketsService {
  private readonly logger = new Logger(MarketsService.name);

  constructor(
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    private readonly usersService: UsersService,
    private readonly sorobanService: SorobanService,
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
}
