import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { Competition } from '../competitions/entities/competition.entity';
import { ActivityLog } from '../analytics/entities/activity-log.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { StatsResponseDto } from './dto/stats-response.dto';

@Injectable()
export class AdminService {
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
    private readonly analyticsService: AnalyticsService,
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
}
