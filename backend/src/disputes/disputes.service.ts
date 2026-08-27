import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  Dispute,
  DisputeStatus,
  DisputeResolution,
  DisputeSlaStage,
} from './entities/dispute.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeVote } from './entities/dispute-vote.entity';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { AttachEvidenceDto } from './dto/attach-evidence.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import {
  ListDisputesDto,
  DisputeStatusCounts,
  PaginatedDisputesResponse,
} from './dto/list-disputes.dto';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';
import { SorobanService } from '../soroban/soroban.service';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';

const DEFAULT_EVIDENCE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_EVIDENCE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

const DEFAULT_SLA_INITIAL_REVIEW_HOURS = 48;
const DEFAULT_SLA_ESCALATION_HOURS = 24;
const DEFAULT_SLA_APPROACHING_WINDOW_HOURS = 6;
const DEFAULT_SLA_REESCALATION_INTERVAL_HOURS = 24;

/**
 * Highest tier a dispute may be escalated to. A tier-MAX_TIER dispute is
 * terminal: escalation past it is rejected.
 */
export const MAX_TIER = 3;
/** How long after a tier resolves it may still be escalated, in hours. */
const DEFAULT_ESCALATION_WINDOW_HOURS = 72;
/** Reputation-weighted participation required to finalize a tier-1 dispute. */
const DEFAULT_TIER1_QUORUM = 100;
/** Each successive tier multiplies the required quorum by this factor. */
const DEFAULT_QUORUM_TIER_MULTIPLIER = 2;

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  /** Max evidence file size accepted by attachEvidence, in bytes. */
  private readonly evidenceMaxSizeBytes: number;
  /** MIME types accepted by attachEvidence. */
  private readonly evidenceAllowedMimeTypes: string[];

  constructor(
    @InjectRepository(Dispute)
    private readonly disputesRepository: Repository<Dispute>,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(DisputeEvidence)
    private readonly evidenceRepository: Repository<DisputeEvidence>,
    @InjectRepository(DisputeVote)
    private readonly votesRepository: Repository<DisputeVote>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly sorobanService: SorobanService,
    private readonly configService: ConfigService,
    private readonly notificationGenerator: NotificationGeneratorService,
  ) {
    const configuredMaxSize = this.configService.get<number>(
      'DISPUTE_EVIDENCE_MAX_SIZE_BYTES',
    );
    this.evidenceMaxSizeBytes =
      configuredMaxSize ?? DEFAULT_EVIDENCE_MAX_SIZE_BYTES;

    const configuredMimeTypes = this.configService.get<string>(
      'DISPUTE_EVIDENCE_ALLOWED_MIME_TYPES',
    );
    this.evidenceAllowedMimeTypes = configuredMimeTypes
      ? configuredMimeTypes.split(',').map((type) => type.trim())
      : DEFAULT_EVIDENCE_ALLOWED_MIME_TYPES;
  }

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

    // Check if dispute window has passed (7 days after actual resolution)
    const disputeWindowEnd = new Date(market.resolved_at!);
    disputeWindowEnd.setDate(disputeWindowEnd.getDate() + 7);

    if (new Date() > disputeWindowEnd) {
      throw new BadRequestException('Dispute window has passed');
    }

    // Check if dispute already exists for this market
    const existingDispute = await this.disputesRepository.findOne({
      where: { marketId },
    });

    if (existingDispute) {
      throw new ConflictException('Dispute already raised for this market');
    }

    // Create dispute with its initial-review SLA clock running
    const slaDeadline = new Date();
    slaDeadline.setHours(
      slaDeadline.getHours() +
        this.getNumericConfig(
          'DISPUTE_SLA_INITIAL_REVIEW_HOURS',
          DEFAULT_SLA_INITIAL_REVIEW_HOURS,
        ),
    );

    const dispute = this.disputesRepository.create({
      marketId,
      disputantId: user.id,
      reason,
      status: DisputeStatus.PENDING,
      tier: 1,
      quorumThreshold: this.quorumForTier(1),
      slaStage: DisputeSlaStage.INITIAL_REVIEW,
      slaDeadline,
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
   * Cast a reputation-weighted vote on a pending dispute tier.
   *
   * Each vote is weighted by the voter's reputation score (snapshotted at
   * cast time), so a small brigade of low-reputation addresses cannot swing
   * an outcome the way it could under naive 1-address-1-vote. A given wallet
   * address may vote at most once across the entire escalation chain (this
   * tier plus every lower tier it escalated from). Once the summed weight of
   * a tier's votes reaches its quorum threshold, the tier finalizes to the
   * outcome carrying the most weight; until then it stays open.
   */
  async castVote(
    disputeId: string,
    dto: CastVoteDto,
    user: User,
  ): Promise<Dispute> {
    const dispute = await this.findOne(disputeId);

    if (dispute.status !== DisputeStatus.PENDING) {
      throw new BadRequestException('Voting is closed for this dispute');
    }

    const voterAddress = user.stellar_address;
    if (!voterAddress) {
      throw new BadRequestException(
        'Voter must have a wallet address to vote on a dispute',
      );
    }

    // Reject a second vote from the same address anywhere in the chain.
    const chainIds = await this.getChainDisputeIds(dispute);
    const existingVote = await this.votesRepository.findOne({
      where: { voterAddress, disputeId: In(chainIds) },
    });
    if (existingVote) {
      throw new ConflictException(
        'This address has already voted in this dispute',
      );
    }

    const weight = Math.max(0, user.reputation_score ?? 0);
    const vote = this.votesRepository.create({
      disputeId,
      voterId: user.id,
      voterAddress,
      outcome: dto.outcome,
      weight,
      tier: dispute.tier,
    });
    await this.votesRepository.save(vote);

    await this.tryFinalizeByQuorum(dispute);

    return this.findOne(disputeId);
  }

  /**
   * Escalate a resolved dispute tier to the next tier. Only permitted once a
   * tier has resolved and only within the escalation window that follows its
   * resolution. A fresh dispute is created one tier up, linked back to this
   * one via {@link Dispute.escalatedFrom}, with a higher quorum threshold.
   * Escalation past {@link MAX_TIER}, outside the window, or of an
   * already-escalated tier is rejected.
   */
  async escalate(disputeId: string, user: User): Promise<Dispute> {
    const dispute = await this.findOne(disputeId);

    if (dispute.status !== DisputeStatus.RESOLVED) {
      throw new BadRequestException(
        'Only a resolved dispute tier can be escalated',
      );
    }

    if (dispute.tier >= MAX_TIER) {
      throw new BadRequestException(
        `Dispute has reached the maximum tier (${MAX_TIER})`,
      );
    }

    if (!dispute.resolvedAt) {
      throw new BadRequestException(
        'Resolved dispute is missing a resolution timestamp',
      );
    }

    const windowHours = this.getNumericConfig(
      'DISPUTE_ESCALATION_WINDOW_HOURS',
      DEFAULT_ESCALATION_WINDOW_HOURS,
    );
    const windowEnd = new Date(
      dispute.resolvedAt.getTime() + windowHours * 60 * 60 * 1000,
    );
    if (new Date() > windowEnd) {
      throw new BadRequestException('Escalation window has passed');
    }

    // A tier can only be escalated once - guard against duplicate chains.
    const existingEscalation = await this.disputesRepository.findOne({
      where: { escalatedFromId: disputeId },
    });
    if (existingEscalation) {
      throw new ConflictException('This dispute has already been escalated');
    }

    const nextTier = dispute.tier + 1;
    const slaDeadline = new Date();
    slaDeadline.setHours(
      slaDeadline.getHours() +
        this.getNumericConfig(
          'DISPUTE_SLA_INITIAL_REVIEW_HOURS',
          DEFAULT_SLA_INITIAL_REVIEW_HOURS,
        ),
    );

    const escalated = this.disputesRepository.create({
      marketId: dispute.marketId,
      disputantId: dispute.disputantId,
      reason: dispute.reason,
      status: DisputeStatus.PENDING,
      tier: nextTier,
      quorumThreshold: this.quorumForTier(nextTier),
      escalatedFromId: dispute.id,
      slaStage: DisputeSlaStage.INITIAL_REVIEW,
      slaDeadline,
    });

    const saved = await this.disputesRepository.save(escalated);

    this.logger.log(
      `Dispute ${disputeId} (tier ${dispute.tier}) escalated to tier ` +
        `${nextTier} as dispute ${saved.id} by user ${user.id}`,
    );

    return this.findOne(saved.id);
  }

  /**
   * Reputation-weighted quorum for a given tier. Higher tiers require more
   * weighted participation before they can finalize.
   */
  private quorumForTier(tier: number): number {
    const base = this.getNumericConfig(
      'DISPUTE_TIER1_QUORUM',
      DEFAULT_TIER1_QUORUM,
    );
    const multiplier = this.getNumericConfig(
      'DISPUTE_QUORUM_TIER_MULTIPLIER',
      DEFAULT_QUORUM_TIER_MULTIPLIER,
    );
    return Math.round(base * Math.pow(multiplier, tier - 1));
  }

  /**
   * IDs of every dispute in this tier's escalation chain: itself plus each
   * lower tier it was escalated from, walking the {@link Dispute.escalatedFrom}
   * links up to the tier-1 root. Used to enforce one-vote-per-address across
   * the whole chain.
   */
  private async getChainDisputeIds(dispute: Dispute): Promise<string[]> {
    const ids = [dispute.id];
    let parentId = dispute.escalatedFromId;

    while (parentId) {
      ids.push(parentId);
      const parent = await this.disputesRepository.findOne({
        where: { id: parentId },
        select: ['id', 'escalatedFromId'],
      });
      parentId = parent?.escalatedFromId ?? null;
    }

    return ids;
  }

  /**
   * Finalize a tier once its votes' summed weight meets quorum. Tallies the
   * reputation-weighted votes; if participation is still below the threshold
   * the dispute is left open. Ties favour the status quo (UPHELD).
   */
  private async tryFinalizeByQuorum(dispute: Dispute): Promise<void> {
    const votes = await this.votesRepository.find({
      where: { disputeId: dispute.id },
    });

    let totalWeight = 0;
    let upheldWeight = 0;
    let overturnedWeight = 0;
    for (const vote of votes) {
      totalWeight += vote.weight;
      if (vote.outcome === DisputeResolution.OVERTURNED) {
        overturnedWeight += vote.weight;
      } else {
        upheldWeight += vote.weight;
      }
    }

    if (totalWeight < dispute.quorumThreshold) {
      // Below quorum - the dispute stays open.
      return;
    }

    const resolution =
      overturnedWeight > upheldWeight
        ? DisputeResolution.OVERTURNED
        : DisputeResolution.UPHELD;

    dispute.status = DisputeStatus.RESOLVED;
    dispute.resolution = resolution;
    dispute.resolvedAt = new Date();
    await this.disputesRepository.save(dispute);

    this.logger.log(
      `Dispute ${dispute.id} (tier ${dispute.tier}) reached quorum ` +
        `(${totalWeight}/${dispute.quorumThreshold}) and resolved as ${resolution}`,
    );
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
   * Find disputes filed by a specific user with pagination
   */
  async findMyDisputes(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    disputes: Dispute[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [disputes, total] = await this.disputesRepository.findAndCount({
      where: { disputantId: userId },
      relations: ['market', 'resolvedBy'],
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
   * List disputes with status/date-range filters and cursor pagination.
   * The cursor encodes `createdAt:id` of the last row of the previous page
   * (base64), so pages stay stable even as new disputes are created
   * concurrently - unlike offset pagination, which can skip or repeat rows
   * under concurrent inserts.
   */
  async findAll(query: ListDisputesDto): Promise<PaginatedDisputesResponse> {
    const limit = query.limit ?? 20;
    const decodedCursor = query.cursor
      ? this.decodeDisputeCursor(query.cursor)
      : null;

    const qb = this.disputesRepository
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.market', 'market')
      .leftJoinAndSelect('dispute.disputant', 'disputant')
      .leftJoinAndSelect('dispute.resolvedBy', 'resolvedBy')
      .orderBy('dispute.createdAt', 'DESC')
      .addOrderBy('dispute.id', 'DESC')
      .take(limit + 1);

    if (query.status) {
      qb.andWhere('dispute.status = :status', { status: query.status });
    }
    if (query.created_after) {
      qb.andWhere('dispute.createdAt >= :createdAfter', {
        createdAfter: new Date(query.created_after),
      });
    }
    if (query.created_before) {
      qb.andWhere('dispute.createdAt <= :createdBefore', {
        createdBefore: new Date(query.created_before),
      });
    }

    if (decodedCursor) {
      qb.andWhere(
        '(dispute.createdAt < :cursorCreatedAt OR (dispute.createdAt = :cursorCreatedAt AND dispute.id < :cursorId))',
        {
          cursorCreatedAt: decodedCursor.createdAt,
          cursorId: decodedCursor.id,
        },
      );
    }

    const [rows, counts] = await Promise.all([
      qb.getMany(),
      this.countByStatus(),
    ]);

    const hasMore = rows.length > limit;
    const disputes = hasMore ? rows.slice(0, limit) : rows;
    const last = disputes[disputes.length - 1];
    const nextCursor =
      hasMore && last
        ? this.encodeDisputeCursor(last.createdAt, last.id)
        : null;

    return {
      disputes,
      next_cursor: nextCursor,
      has_more: hasMore,
      limit,
      counts_by_status: counts,
    };
  }

  private encodeDisputeCursor(createdAt: Date, id: string): string {
    return Buffer.from(`${createdAt.toISOString()}:${id}`, 'utf-8').toString(
      'base64',
    );
  }

  private decodeDisputeCursor(cursor: string): { createdAt: Date; id: string } {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const separatorIndex = decoded.lastIndexOf(':');
      const isoDate = decoded.slice(0, separatorIndex);
      const id = decoded.slice(separatorIndex + 1);
      const createdAt = new Date(isoDate);
      if (!id || Number.isNaN(createdAt.getTime())) {
        throw new Error('malformed cursor');
      }
      return { createdAt, id };
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }

  /** Counts of disputes grouped by status, for list response metadata. */
  private async countByStatus(): Promise<DisputeStatusCounts> {
    const rows = await this.disputesRepository
      .createQueryBuilder('dispute')
      .select('dispute.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dispute.status')
      .getRawMany<{ status: DisputeStatus; count: string }>();

    const counts: DisputeStatusCounts = { pending: 0, resolved: 0 };
    for (const row of rows) {
      if (row.status === DisputeStatus.PENDING) {
        counts.pending = Number(row.count);
      } else if (row.status === DisputeStatus.RESOLVED) {
        counts.resolved = Number(row.count);
      }
    }
    return counts;
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

    const disputeWindowEnd = new Date(market.resolved_at!);
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
   * Attach evidence to a pending dispute. Only the disputant or the
   * disputed market's creator may attach evidence.
   */
  async attachEvidence(
    disputeId: string,
    dto: AttachEvidenceDto,
    user: User,
  ): Promise<DisputeEvidence> {
    const dispute = await this.findOne(disputeId);
    this.assertIsDisputeParticipant(dispute, user);

    if (dispute.status !== DisputeStatus.PENDING) {
      throw new BadRequestException(
        'Evidence can only be attached to a pending dispute',
      );
    }

    if (!this.evidenceAllowedMimeTypes.includes(dto.mimeType)) {
      throw new BadRequestException(
        `File type "${dto.mimeType}" is not allowed`,
      );
    }

    if (dto.sizeBytes > this.evidenceMaxSizeBytes) {
      throw new BadRequestException(
        `File exceeds maximum size of ${this.evidenceMaxSizeBytes} bytes`,
      );
    }

    const evidence = this.evidenceRepository.create({
      disputeId,
      uploadedById: user.id,
      fileUrl: dto.fileUrl,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      description: dto.description ?? null,
    });

    return this.evidenceRepository.save(evidence);
  }

  /**
   * List evidence for a dispute. Only the disputant or the disputed
   * market's creator may list evidence.
   */
  async listEvidence(
    disputeId: string,
    user: User,
  ): Promise<DisputeEvidence[]> {
    const dispute = await this.findOne(disputeId);
    this.assertIsDisputeParticipant(dispute, user);

    return this.evidenceRepository.find({
      where: { disputeId },
      relations: ['uploadedBy'],
      order: { createdAt: 'ASC' },
    });
  }

  private assertIsDisputeParticipant(dispute: Dispute, user: User): void {
    const isDisputant = dispute.disputantId === user.id;
    const isMarketCreator = dispute.market?.creator?.id === user.id;

    if (!isDisputant && !isMarketCreator) {
      throw new ForbiddenException(
        'Only dispute participants can access evidence for this dispute',
      );
    }
  }

  /**
   * Assign an admin/moderator as the arbiter responsible for a pending
   * dispute. Assigning an arbiter does not itself change the SLA clock -
   * it only changes who gets notified as the deadline approaches or is
   * breached.
   */
  async assignArbiter(
    disputeId: string,
    arbiterId: string,
    adminId: string,
  ): Promise<Dispute> {
    const dispute = await this.findOne(disputeId);

    if (dispute.status !== DisputeStatus.PENDING) {
      throw new BadRequestException(
        'Arbiters can only be assigned to pending disputes',
      );
    }

    const arbiter = await this.usersRepository.findOne({
      where: { id: arbiterId },
    });

    if (!arbiter) {
      throw new NotFoundException('Arbiter user not found');
    }

    if (arbiter.role !== 'admin' && arbiter.role !== 'moderator') {
      throw new BadRequestException(
        'Arbiter must have the admin or moderator role',
      );
    }

    dispute.assignedArbiterId = arbiter.id;
    await this.disputesRepository.save(dispute);

    this.logger.log(
      `Admin ${adminId} assigned arbiter ${arbiter.id} to dispute ${disputeId}`,
    );

    return this.findOne(disputeId);
  }

  /**
   * Scheduled SLA sweep: runs hourly. For every pending dispute, checks
   * whether its current SLA stage deadline has passed (escalating and
   * notifying on first breach, and periodically re-notifying afterwards)
   * or is approaching (notifying once per stage). This never resolves,
   * bans, or otherwise auto-enforces anything - it only tracks time and
   * sends advisory notifications, per policy.
   */
  @Cron('0 0 * * * *')
  async runSlaCheck(): Promise<{
    approaching: number;
    breached: number;
    escalated: number;
  }> {
    if (this.configService.get<string>('DISPUTE_SLA_ENABLED') === 'false') {
      return { approaching: 0, breached: 0, escalated: 0 };
    }

    const pendingDisputes = await this.disputesRepository.find({
      where: { status: DisputeStatus.PENDING },
      relations: ['market', 'disputant', 'assignedArbiter'],
    });

    let approaching = 0;
    let breached = 0;
    let escalated = 0;
    const now = new Date();

    for (const dispute of pendingDisputes) {
      try {
        const outcome = await this.evaluateDisputeSla(dispute, now);
        if (outcome === 'approaching') approaching++;
        if (outcome === 'breached') breached++;
        if (outcome === 'escalated') {
          breached++;
          escalated++;
        }
      } catch (error) {
        this.logger.error(
          `SLA evaluation failed for dispute ${dispute.id}`,
          error,
        );
      }
    }

    if (approaching || breached) {
      this.logger.log(
        `Dispute SLA sweep: ${approaching} approaching, ${breached} breached (${escalated} newly escalated)`,
      );
    }

    return { approaching, breached, escalated };
  }

  private async evaluateDisputeSla(
    dispute: Dispute,
    now: Date,
  ): Promise<'none' | 'approaching' | 'breached' | 'escalated'> {
    const approachingWindowHours = this.getNumericConfig(
      'DISPUTE_SLA_APPROACHING_WINDOW_HOURS',
      DEFAULT_SLA_APPROACHING_WINDOW_HOURS,
    );
    const reescalationIntervalHours = this.getNumericConfig(
      'DISPUTE_SLA_REESCALATION_INTERVAL_HOURS',
      DEFAULT_SLA_REESCALATION_INTERVAL_HOURS,
    );

    if (now < dispute.slaDeadline) {
      const hoursUntilDeadline =
        (dispute.slaDeadline.getTime() - now.getTime()) / (60 * 60 * 1000);

      if (
        hoursUntilDeadline <= approachingWindowHours &&
        !dispute.slaApproachingNotifiedAt
      ) {
        dispute.slaApproachingNotifiedAt = now;
        await this.disputesRepository.save(dispute);
        await this.notifySlaRecipients(dispute, 'approaching', false);
        return 'approaching';
      }

      return 'none';
    }

    // Deadline has passed.
    if (!dispute.slaBreachedAt) {
      dispute.slaBreachedAt = now;
      let escalatedNow = false;

      if (dispute.slaStage === DisputeSlaStage.INITIAL_REVIEW) {
        dispute.slaStage = DisputeSlaStage.ESCALATED;
        const escalationHours = this.getNumericConfig(
          'DISPUTE_SLA_ESCALATION_HOURS',
          DEFAULT_SLA_ESCALATION_HOURS,
        );
        const newDeadline = new Date(now);
        newDeadline.setHours(newDeadline.getHours() + escalationHours);
        dispute.slaDeadline = newDeadline;
        dispute.slaApproachingNotifiedAt = null;
        escalatedNow = true;
      }

      dispute.slaBreachedNotifiedAt = now;
      await this.disputesRepository.save(dispute);
      await this.notifySlaRecipients(dispute, 'breached', escalatedNow);
      return escalatedNow ? 'escalated' : 'breached';
    }

    // Already breached previously (already at the terminal ESCALATED
    // stage) - re-notify periodically so it doesn't silently go stale.
    const hoursSinceLastNotified = dispute.slaBreachedNotifiedAt
      ? (now.getTime() - dispute.slaBreachedNotifiedAt.getTime()) /
        (60 * 60 * 1000)
      : Infinity;

    if (hoursSinceLastNotified >= reescalationIntervalHours) {
      dispute.slaBreachedNotifiedAt = now;
      await this.disputesRepository.save(dispute);
      await this.notifySlaRecipients(dispute, 'breached', false);
      return 'breached';
    }

    return 'none';
  }

  private async notifySlaRecipients(
    dispute: Dispute,
    kind: 'approaching' | 'breached',
    escalated: boolean,
  ): Promise<void> {
    const recipientAddresses = await this.getSlaRecipientAddresses(dispute);
    const input = {
      disputeId: dispute.id,
      marketId: dispute.marketId,
      marketTitle: dispute.market?.title ?? dispute.marketId,
      slaDeadline: dispute.slaDeadline,
      recipientAddresses,
    };

    if (kind === 'approaching') {
      await this.notificationGenerator.notifyDisputeSlaApproaching(input);
    } else {
      await this.notificationGenerator.notifyDisputeSlaBreached({
        ...input,
        escalated,
      });
    }
  }

  /**
   * Recipients for SLA notifications: the assigned arbiter (if any) plus
   * every admin, deduplicated by address.
   */
  private async getSlaRecipientAddresses(dispute: Dispute): Promise<string[]> {
    const admins = await this.usersRepository.find({
      where: { role: Role.Admin },
    });

    const addresses = new Set<string>();
    if (dispute.assignedArbiter?.stellar_address) {
      addresses.add(dispute.assignedArbiter.stellar_address);
    }
    for (const admin of admins) {
      if (admin.stellar_address) {
        addresses.add(admin.stellar_address);
      }
    }

    return Array.from(addresses);
  }

  private getNumericConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw !== undefined ? parseFloat(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
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
