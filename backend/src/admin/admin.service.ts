import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { Competition } from '../competitions/entities/competition.entity';
import { ActivityLog } from '../analytics/entities/activity-log.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { SorobanService } from '../soroban/soroban.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { StatsResponseDto } from './dto/stats-response.dto';
import { ResolveMarketDto } from './dto/resolve-market.dto';
import { SystemConfig } from './entities/system-config.entity';
import {
  UpdateSystemConfigDto,
  SystemConfigValues,
  DEFAULT_CONFIG,
} from './dto/system-config.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private configCache: SystemConfigValues | null = null;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(Prediction)
    private readonly predictionsRepository: Repository<Prediction>,
    @InjectRepository(Competition)
    private readonly competitionsRepository: Repository<Competition>,
    @InjectRepository(ActivityLog)
    private readonly activityLogsRepository: Repository<ActivityLog>,
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepository: Repository<SystemConfig>,
    private readonly analyticsService: AnalyticsService,
    private readonly notificationsService: NotificationsService,
    private readonly sorobanService: SorobanService,
  ) {}

  async getConfig(): Promise<SystemConfigValues> {
    if (this.configCache) return this.configCache;

    const rows = await this.systemConfigRepository.find();
    const config = { ...DEFAULT_CONFIG };

    for (const row of rows) {
      if (row.key in config) {
        (config as Record<string, unknown>)[row.key] = row.value;
      }
    }

    this.configCache = config;
    return config;
  }

  async updateConfig(dto: UpdateSystemConfigDto, adminId: string): Promise<SystemConfigValues> {
    const updates = Object.entries(dto).filter(([, v]) => v !== undefined);

    for (const [key, value] of updates) {
      await this.systemConfigRepository.save({ key, value });
    }

    this.configCache = null;

    await this.analyticsService.logActivity(adminId, 'SYSTEM_CONFIG_UPDATED', {
      updated_keys: updates.map(([k]) => k),
    });

    return this.getConfig();
  }

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
      this.logger.error('Soroban resolveMarket failed during admin resolution', err);
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
            ...(dto.resolution_note ? { resolution_note: dto.resolution_note } : {}),
          },
        ),
      ),
    );

    // Log admin action
    await this.analyticsService.logActivity(adminId, 'MARKET_RESOLVED_BY_ADMIN', {
      market_id: market.id,
      resolved_outcome: dto.resolved_outcome,
      resolution_note: dto.resolution_note ?? null,
    });

    this.logger.log(
      `Admin ${adminId} resolved market "${market.title}" (${market.id}) with outcome "${dto.resolved_outcome}"`,
    );

    return saved;
  }
}
