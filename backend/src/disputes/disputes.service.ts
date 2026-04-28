import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Dispute,
  DisputeStatus,
  DisputeResolution,
} from './entities/dispute.entity';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { SorobanService } from '../soroban/soroban.service';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @InjectRepository(Dispute)
    private readonly disputesRepository: Repository<Dispute>,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    private readonly sorobanService: SorobanService,
  ) {}

  /**
   * Create a new dispute for a resolved market
   */
  async create(
    createDisputeDto: CreateDisputeDto,
    user: User,
  ): Promise<Dispute> {
    const { market_id, reason } = createDisputeDto;
    const marketId = market_id;

    // Check if market exists and is resolved
    const market = await this.marketsRepository.findOne({
      where: { id: market_id },
    });

    if (!market) {
      throw new NotFoundException('Market not found');
    }

    if (!market.is_resolved) {
      throw new BadRequestException(
        'Disputes can only be raised for resolved markets',
      );
    }

    // Check if dispute window has passed (7 days after resolution)
    const disputeWindowEnd = new Date(market.resolution_time);
    disputeWindowEnd.setDate(disputeWindowEnd.getDate() + 7);

    if (new Date() > disputeWindowEnd) {
      throw new BadRequestException('Dispute window has passed');
    }

    // Check if dispute already exists for this market
    const existingDispute = await this.disputesRepository.findOne({
      where: { marketId, status: DisputeStatus.PENDING },
    });

    if (existingDispute) {
      throw new ConflictException('Dispute already raised for this market');
    }

    // Create dispute
    const dispute = this.disputesRepository.create({
      marketId,
      disputantId: user.id,
      reason,
      status: DisputeStatus.PENDING,
    });

    const savedDispute = await this.disputesRepository.save(dispute);

    // Record dispute on-chain (non-blocking)
    this.recordDisputeOnChain(
      savedDispute.id,
      market.on_chain_market_id,
      reason,
    ).catch((error) => {
      this.logger.error('Failed to record dispute on-chain:', error);
    });

    return this.findOne(savedDispute.id);
  }

  /**
   * Resolve a dispute
   */
  async resolve(
    id: string,
    resolveDisputeDto: ResolveDisputeDto,
    adminUser: User,
  ): Promise<Dispute> {
    const dispute = await this.findOne(id);

    if (dispute.status !== DisputeStatus.PENDING) {
      throw new BadRequestException('Dispute is not pending');
    }

    const { resolution, admin_notes } = resolveDisputeDto;

    // Update dispute
    dispute.status = DisputeStatus.RESOLVED;
    dispute.resolution = resolution;
    dispute.adminNotes = admin_notes || null;
    dispute.resolvedById = adminUser.id;
    dispute.resolvedAt = new Date();

    const savedDispute = await this.disputesRepository.save(dispute);

    // Record resolution on-chain (non-blocking)
    this.recordResolutionOnChain(
      savedDispute.id,
      dispute.market.on_chain_market_id,
      resolution,
    ).catch((error) => {
      this.logger.error('Failed to record dispute resolution on-chain:', error);
    });

    // Handle overturned market
    if (resolution === DisputeResolution.UPHELD) {
      this.handleOverturnedMarket(dispute.market);
    }

    return this.findOne(id);
  }

  /**
   * Find a dispute by ID with relations
   */
  async findOne(id: string): Promise<Dispute> {
    const dispute = await this.disputesRepository.findOne({
      where: { id },
      relations: ['market', 'disputant', 'resolvedBy'],
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    return dispute;
  }

  /**
   * Find disputes by market ID
   */
  async findByMarket(marketId: string): Promise<Dispute[]> {
    return this.disputesRepository.find({
      where: { marketId },
      relations: ['disputant', 'resolvedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find all disputes with pagination
   */
  async findAll(
    page = 1,
    limit = 20,
    status?: DisputeStatus,
  ): Promise<{
    disputes: Dispute[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where = status ? { status } : {};

    const [disputes, total] = await this.disputesRepository.findAndCount({
      where,
      relations: ['market', 'disputant', 'resolvedBy'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      disputes,
      total,
      page,
      limit,
    };
  }

  /**
   * Check if dispute window is still open for a market
   */
  async checkDisputeWindow(marketId: string): Promise<boolean> {
    const market = await this.marketsRepository.findOne({
      where: { id: marketId },
    });

    if (!market || !market.is_resolved) {
      return false;
    }

    const disputeWindowEnd = new Date(market.resolution_time);
    disputeWindowEnd.setDate(disputeWindowEnd.getDate() + 7);

    return new Date() <= disputeWindowEnd;
  }

  /**
   * Record dispute on-chain
   */
  private async recordDisputeOnChain(
    disputeId: string,
    marketOnChainId: string,
    reason: string,
  ): Promise<void> {
    try {
      const onChainResult = await this.sorobanService.raiseDispute(
        marketOnChainId,
        reason,
      );

      await this.disputesRepository.update(disputeId, {
        onChainDisputeId: onChainResult.dispute_id,
      });

      this.logger.log(
        `Dispute ${disputeId} recorded on-chain with ID: ${onChainResult.dispute_id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to record dispute ${disputeId} on-chain:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Record dispute resolution on-chain
   */
  private async recordResolutionOnChain(
    disputeId: string,
    marketOnChainId: string,
    resolution: DisputeResolution,
  ): Promise<void> {
    try {
      const dispute = await this.disputesRepository.findOne({
        where: { id: disputeId },
      });

      if (!dispute?.onChainDisputeId) {
        this.logger.warn(
          `No on-chain dispute ID found for dispute ${disputeId}`,
        );
        return;
      }

      const onChainResult = await this.sorobanService.resolveDispute(
        marketOnChainId,
        dispute.onChainDisputeId,
        resolution,
      );

      await this.disputesRepository.update(disputeId, {
        onChainResolutionTx: onChainResult.tx_hash,
      });

      this.logger.log(
        `Dispute resolution ${disputeId} recorded on-chain with TX: ${onChainResult.tx_hash}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to record dispute resolution ${disputeId} on-chain:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Handle overturned market logic
   */
  private handleOverturnedMarket(market: Market): void {
    // For upheld disputes, we might need to handle refunds or other logic
    // This is a placeholder for any additional business logic needed
    // when a market outcome is overturned
    this.logger.log(
      `Market ${market.id} outcome overturned due to upheld dispute`,
    );
  }
}
