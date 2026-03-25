import {
  Injectable,
  BadRequestException,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Market } from './entities/market.entity';
import { UsersService } from '../users/users.service';
import { SorobanService } from '../soroban/soroban.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class MarketsService {
  private readonly logger = new Logger(MarketsService.name);

  constructor(
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    private readonly usersService: UsersService,
    private readonly sorobanService: SorobanService,
  ) {}

  async findAll(): Promise<Market[]> {
    return this.marketsRepository.find({
      relations: ['creator'],
    });
  }

  async findById(id: string): Promise<Market | null> {
    return this.marketsRepository.findOne({
      where: { id },
      relations: ['creator'],
    });
  }

  async createMarket(dto: CreateMarketDto, creator: User): Promise<Market> {
    const endTime = new Date(dto.end_time);
    const resolutionTime = new Date(dto.resolution_time);
    const now = new Date();

    if (endTime <= now) {
      throw new BadRequestException('end_time must be in the future');
    }

    if (resolutionTime <= endTime) {
      throw new BadRequestException(
        'resolution_time must be after end_time',
      );
    }

    // Call Soroban contract to create market on-chain
    let onChainResult;
    try {
      onChainResult = await this.sorobanService.createMarket({
        title: dto.title,
        description: dto.description,
        category: dto.category,
        outcomes: dto.outcome_options,
        endTime,
        resolutionTime,
        creatorAddress: creator.stellar_address,
        creatorFeeBps: dto.creator_fee_bps ?? 0,
        minStake: dto.min_stake ?? 10_000_000,
        maxStake: dto.max_stake ?? 100_000_000,
        isPublic: dto.is_public ?? true,
      });
    } catch (error) {
      this.logger.error('Soroban createMarket failed', error);
      throw new BadGatewayException(
        'Failed to create market on-chain. Please try again.',
      );
    }

    // Store in DB with the on-chain ID
    const market = this.marketsRepository.create({
      on_chain_market_id: onChainResult.onChainMarketId,
      creator,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      outcome_options: dto.outcome_options,
      end_time: endTime,
      resolution_time: resolutionTime,
      is_public: dto.is_public ?? true,
    });

    try {
      return await this.marketsRepository.save(market);
    } catch (dbError) {
      this.logger.error('Failed to save market to DB after on-chain success', dbError);
      throw new BadGatewayException(
        'Market created on-chain but failed to save locally. Contact support.',
      );
    }
  }
}
