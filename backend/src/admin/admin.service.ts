import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { Comment } from '../markets/entities/comment.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { Competition } from '../competitions/entities/competition.entity';
import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import { ActivityLog } from '../analytics/entities/activity-log.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SorobanService } from '../soroban/soroban.service';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import {
  ReportFormat,
  ReportQueryDto,
  ReportTimeframe,
} from './dto/report-query.dto';
import { ResolveMarketDto } from './dto/resolve-market.dto';
import { StatsResponseDto } from './dto/stats-response.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Prediction)
    private readonly predictionsRepository: Repository<Prediction>,
    @InjectRepository(Competition)
    private readonly competitionsRepository: Repository<Competition>,
    @InjectRepository(CompetitionParticipant)
    private readonly competitionParticipantsRepository: Repository<CompetitionParticipant>,
    @InjectRepository(ActivityLog)
    private readonly activityLogsRepository: Repository<ActivityLog>,
    private readonly analyticsService: AnalyticsService,
    private readonly notificationsService: NotificationsService,
    private readonly sorobanService: SorobanService,
  ) {}

  async getStats(): Promise<StatsResponseDto> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const total_users = await this.usersRepository.count();
    const active_users_24h = await this.usersRepository.count({
      where: { updated_at: Between(twentyFourHoursAgo, now) },
    });
    const active_users_7d = await this.usersRepository.count({
      where: { updated_at: Between(sevenDaysAgo, now) },
    });

    const total_markets = await this.marketsRepository.count();
    const active_markets = await this.marketsRepository.count({
      where: { is_resolved: false, is_cancelled: false },
    });
    const resolved_markets = await this.marketsRepository.count({
      where: { is_resolved: true },
    });

    const total_predictions = await this.predictionsRepository.count();

    const volumeResult = (await this.marketsRepository
      .createQueryBuilder('market')
      .select('SUM(CAST(market.total_pool_stroops AS DECIMAL))', 'total')
      .getRawOne()) as { total: string | null };

    const total_volume_stroops = volumeResult?.total || '0';

    const total_competitions = await this.competitionsRepository.count();

    // Platform revenue (2% fee of total volume as an example)
    const platform_revenue_stroops = (
      (BigInt(total_volume_stroops.split('.')[0]) * BigInt(2)) /
      BigInt(100)
    ).toString();

    return {
      total_users,
      active_users_24h,
      active_users_7d,
      total_markets,
      active_markets,
      resolved_markets,
      total_predictions,
      total_volume_stroops,
      total_competitions,
      platform_revenue_stroops,
    };
  }

  async listUsers(query: ListUsersQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.usersRepository.createQueryBuilder('user');

    if (search) {
      queryBuilder.where(
        'user.username ILIKE :search OR user.stellar_address ILIKE :search',
        {
          search: `%${search}%`,
        },
      );
    }

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    queryBuilder.orderBy(`user.${sortBy}`, sortOrder).skip(skip).take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async banUser(id: string, reason: string, adminId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    user.is_banned = true;
    user.ban_reason = reason;
    user.banned_at = new Date();
    user.banned_by = adminId;

    await this.usersRepository.save(user);

    await this.analyticsService.logActivity(user.id, 'USER_BANNED', {
      reason,
      banned_by: adminId,
    });

    return user;
  }

  async unbanUser(id: string, adminId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    user.is_banned = false;
    user.ban_reason = null;
    user.banned_at = null;
    user.banned_by = null;

    await this.usersRepository.save(user);

    await this.analyticsService.logActivity(user.id, 'USER_UNBANNED', {
      unbanned_by: adminId,
    });

    return user;
  }

  async updateUserRole(
    id: string,
    dto: UpdateUserRoleDto,
    adminId: string,
  ): Promise<User> {
    if (id === adminId) {
      throw new BadRequestException('You cannot change your own role');
    }

    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const previousRole = user.role;
    user.role = dto.role;

    await this.usersRepository.save(user);

    await this.analyticsService.logActivity(adminId, 'USER_ROLE_CHANGED', {
      target_user_id: id,
      previous_role: previousRole,
      new_role: dto.role,
    });

    this.logger.log(
      `Admin ${adminId} changed role of user ${id} from "${previousRole}" to "${dto.role}"`,
    );

    return user;
  }

  async getUserActivity(userId: string, query: ActivityLogQueryDto) {
    const { page = 1, limit = 10, actionType, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.activityLogsRepository.createQueryBuilder('log');
    queryBuilder.where('log.userId = :userId', { userId });

    if (actionType) {
      queryBuilder.andWhere('log.actionType = :actionType', { actionType });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('log.timestamp BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    }

    queryBuilder.orderBy('log.timestamp', 'DESC').skip(skip).take(limit);

    const [logs, total] = await queryBuilder.getManyAndCount();

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async adminResolveMarket(
    id: string,
    dto: ResolveMarketDto,
    adminId: string,
  ): Promise<Market> {
    const market = await this.marketsRepository.findOne({
      where: [{ id }, { on_chain_market_id: id }],
    });

    if (!market) {
      throw new NotFoundException(`Market "${id}" not found`);
    }

    if (market.is_resolved) {
      throw new ConflictException('Market is already resolved');
    }

    if (market.is_cancelled) {
      throw new BadRequestException('Cannot resolve a cancelled market');
    }

    if (!market.outcome_options.includes(dto.resolved_outcome)) {
      throw new BadRequestException(
        `Invalid outcome "${dto.resolved_outcome}". Valid options: ${market.outcome_options.join(', ')}`,
      );
    }

    // Trigger payout distribution on-chain
    try {
      await this.sorobanService.resolveMarket(
        market.on_chain_market_id,
        dto.resolved_outcome,
      );
    } catch (err) {
      this.logger.error(
        'Soroban resolveMarket failed during admin resolution',
        err,
      );
      throw new BadGatewayException('Failed to resolve market on Soroban');
    }

    market.is_resolved = true;
    market.resolved_outcome = dto.resolved_outcome;
    const saved = await this.marketsRepository.save(market);

    // Notify all participants
    const predictions = await this.predictionsRepository.find({
      where: { market: { id: market.id } },
      relations: ['user'],
    });

    await Promise.all(
      predictions.map((p) =>
        this.notificationsService.create(
          p.user.id,
          NotificationType.MarketResolved,
          'Market Resolved',
          `The market "${market.title}" has been resolved. Winning outcome: ${dto.resolved_outcome}.`,
          {
            market_id: market.id,
            resolved_outcome: dto.resolved_outcome,
            your_prediction: p.chosen_outcome,
            won: p.chosen_outcome === dto.resolved_outcome,
            ...(dto.resolution_note
              ? { resolution_note: dto.resolution_note }
              : {}),
          },
        ),
      ),
    );

    // Log admin action
    await this.analyticsService.logActivity(
      adminId,
      'MARKET_RESOLVED_BY_ADMIN',
      {
        market_id: market.id,
        resolved_outcome: dto.resolved_outcome,
        resolution_note: dto.resolution_note ?? null,
      },
    );

    this.logger.log(
      `Admin ${adminId} resolved market "${market.title}" (${market.id}) with outcome "${dto.resolved_outcome}"`,
    );

    return saved;
  }

  async adminCancelCompetition(
    competitionId: string,
    adminId: string,
  ): Promise<Competition> {
    const competition = await this.competitionsRepository.findOne({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new NotFoundException(
        `Competition with ID "${competitionId}" not found`,
      );
    }

    if (competition.is_cancelled) {
      throw new ConflictException('Competition is already cancelled');
    }

    if (competition.is_finalized) {
      throw new ConflictException('Finalized competitions cannot be cancelled');
    }

    const participants = await this.competitionParticipantsRepository.find({
      where: { competition_id: competition.id },
      relations: ['user'],
    });

    const totalPool = BigInt(competition.prize_pool_stroops);
    const participantCount = participants.length;
    const shouldRefund = totalPool > 0n && participantCount > 0;

    const refundAllocations = new Map<string, string>();

    if (shouldRefund) {
      const baseRefund = totalPool / BigInt(participantCount);
      let remainder = totalPool % BigInt(participantCount);

      for (const participant of participants) {
        const hasAddress = Boolean(participant.user?.stellar_address);
        if (!hasAddress) {
          refundAllocations.set(participant.user_id, '0');
          continue;
        }

        let refundAmount = baseRefund;
        if (remainder > 0n) {
          refundAmount += 1n;
          remainder -= 1n;
        }

        refundAllocations.set(participant.user_id, refundAmount.toString());

        try {
          await this.sorobanService.refundCompetitionParticipant(
            participant.user.stellar_address,
            competition.id,
            refundAmount.toString(),
          );
        } catch (err) {
          this.logger.error('Soroban competition refund failed', err);
          throw new BadGatewayException(
            'Failed to refund participants on Soroban',
          );
        }
      }
    }

    competition.is_cancelled = true;
    const savedCompetition =
      await this.competitionsRepository.save(competition);

    await Promise.all(
      participants.map((participant) =>
        this.notificationsService.create(
          participant.user_id,
          NotificationType.System,
          'Competition Cancelled',
          `The competition "${competition.title}" has been cancelled by an administrator.${
            shouldRefund ? ' Any applicable refunds have been initiated.' : ''
          }`,
          {
            competition_id: competition.id,
            is_cancelled: true,
            refunded_stroops: refundAllocations.get(participant.user_id) ?? '0',
          },
        ),
      ),
    );

    await this.analyticsService.logActivity(
      adminId,
      'COMPETITION_CANCELLED_BY_ADMIN',
      {
        competition_id: competition.id,
        participants_notified: participants.length,
        refunds_initiated: shouldRefund,
      },
    );

    this.logger.log(
      `Admin ${adminId} cancelled competition "${competition.title}" (${competition.id})`,
    );

    return savedCompetition;
  }

  async moderateComment(
    commentId: string,
    isModerated: boolean,
    reason?: string,
  ): Promise<Comment> {
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID "${commentId}" not found`);
    }

    comment.is_moderated = isModerated;
    comment.moderation_reason = reason ?? null;

    return await this.commentsRepository.save(comment);
  }

  async featureMarket(marketId: string, adminId: string): Promise<Market> {
    const market = await this.marketsRepository.findOne({
      where: [{ id: marketId }, { on_chain_market_id: marketId }],
    });

    if (!market) {
      throw new NotFoundException(`Market "${marketId}" not found`);
    }

    if (market.is_featured) {
      throw new ConflictException('Market is already featured');
    }

    market.is_featured = true;
    market.featured_at = new Date();
    const saved = await this.marketsRepository.save(market);

    // Log admin action
    await this.analyticsService.logActivity(
      adminId,
      'MARKET_FEATURED_BY_ADMIN',
      {
        market_id: market.id,
        featured_at: market.featured_at,
      },
    );

    this.logger.log(
      `Admin ${adminId} featured market "${market.title}" (${market.id})`,
    );

    return saved;
  }

  async unfeatureMarket(marketId: string, adminId: string): Promise<Market> {
    const market = await this.marketsRepository.findOne({
      where: [{ id: marketId }, { on_chain_market_id: marketId }],
    });

    if (!market) {
      throw new NotFoundException(`Market "${marketId}" not found`);
    }

    if (!market.is_featured) {
      throw new ConflictException('Market is not featured');
    }

    market.is_featured = false;
    market.featured_at = null;
    const saved = await this.marketsRepository.save(market);

    // Log admin action
    await this.analyticsService.logActivity(
      adminId,
      'MARKET_UNFEATURED_BY_ADMIN',
      {
        market_id: market.id,
        unfeatured_at: new Date(),
      },
    );

    this.logger.log(
      `Admin ${adminId} unfeatured market "${market.title}" (${market.id})`,
    );

    return saved;
  }

  async getActivityReport(query: ReportQueryDto) {
    const { timeframe, format } = query;
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case ReportTimeframe.Daily:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case ReportTimeframe.Weekly:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case ReportTimeframe.Monthly:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // User Growth
    const userGrowth = await this.usersRepository.count({
      where: { created_at: Between(startDate, now) },
    });

    // Market Creation Trends
    const marketsCreated = await this.marketsRepository.count({
      where: { created_at: Between(startDate, now) },
    });

    // Platform Revenue (accumulated in this period)
    const volumeResult = (await this.marketsRepository
      .createQueryBuilder('market')
      .select('SUM(CAST(market.total_pool_stroops AS DECIMAL))', 'total')
      .where('market.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate: now,
      })
      .getRawOne()) as { total: string | null };

    const periodVolume = volumeResult?.total || '0';
    const periodRevenue = (
      (BigInt(periodVolume.split('.')[0]) * BigInt(2)) /
      BigInt(100)
    ).toString();

    // Predictions activity
    const predictionsCount = await this.predictionsRepository.count({
      where: { submitted_at: Between(startDate, now) },
    });

    const reportData = {
      timeframe,
      period_start: startDate.toISOString(),
      period_end: now.toISOString(),
      user_growth: userGrowth,
      markets_created: marketsCreated,
      total_predictions: predictionsCount,
      period_volume_stroops: periodVolume,
      platform_revenue_stroops: periodRevenue,
    };

    if (format === ReportFormat.CSV) {
      const headers = Object.keys(reportData).join(',');
      const values = Object.values(reportData).join(',');
      return `${headers}\n${values}`;
    }

    return reportData;
  }
}
