import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsService } from '../analytics/analytics.service';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { CreateFlagDto } from './dto/create-flag.dto';
import { ListFlagsQueryDto } from './dto/list-flags-query.dto';
import { ResolveFlagDto } from './dto/resolve-flag.dto';
import { Flag, FlagResolutionAction, FlagStatus } from './entities/flag.entity';

@Injectable()
export class FlagsService {
  constructor(
    @InjectRepository(Flag)
    private readonly flagsRepository: Repository<Flag>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async createFlag(
    userId: string,
    createFlagDto: CreateFlagDto,
  ): Promise<Flag> {
    const market = await this.marketsRepository.findOne({
      where: { id: createFlagDto.market_id },
    });
    if (!market) {
      throw new NotFoundException('Market not found');
    }

    const existingFlag = await this.flagsRepository.findOne({
      where: {
        user_id: userId,
        market_id: createFlagDto.market_id,
        status: FlagStatus.PENDING,
      },
    });

    if (existingFlag) {
      throw new ForbiddenException('You have already flagged this market');
    }

    const flag = this.flagsRepository.create({
      ...createFlagDto,
      user_id: userId,
    });

    const savedFlag = await this.flagsRepository.save(flag);

    await this.analyticsService.logActivity(userId, 'MARKET_FLAGGED', {
      market_id: createFlagDto.market_id,
      reason: createFlagDto.reason,
    });

    return savedFlag;
  }

  async listFlags(query: ListFlagsQueryDto) {
    const {
      page = 1,
      limit = 10,
      status,
      reason,
      user_id,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const queryBuilder = this.flagsRepository
      .createQueryBuilder('flag')
      .leftJoinAndSelect('flag.market', 'market')
      .leftJoinAndSelect('flag.user', 'user')
      .leftJoinAndSelect('flag.resolved_by_user', 'resolvedByUser');

    if (status) {
      queryBuilder.andWhere('flag.status = :status', { status });
    }

    if (reason) {
      queryBuilder.andWhere('flag.reason = :reason', { reason });
    }

    if (user_id) {
      queryBuilder.andWhere('flag.user_id = :user_id', { user_id });
    }

    queryBuilder
      .orderBy(`flag.${sortBy}`, sortOrder as 'ASC' | 'DESC')
      .skip(skip)
      .take(Number(limit));

    const [flags, total] = await queryBuilder.getManyAndCount();

    return {
      data: flags,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  async resolveFlag(
    flagId: string,
    resolveFlagDto: ResolveFlagDto,
    adminId: string,
  ): Promise<Flag> {
    const flag = await this.flagsRepository.findOne({
      where: { id: flagId },
      relations: ['market', 'user'],
    });

    if (!flag) {
      throw new NotFoundException('Flag not found');
    }

    if (flag.status !== FlagStatus.PENDING) {
      throw new ForbiddenException('Flag has already been resolved');
    }

    flag.status = FlagStatus.RESOLVED;
    flag.resolution_action = resolveFlagDto.action;
    flag.admin_notes = resolveFlagDto.admin_notes || null;
    flag.resolved_by = adminId;
    flag.resolved_at = new Date();

    switch (resolveFlagDto.action) {
      case FlagResolutionAction.DISMISS:
        flag.status = FlagStatus.DISMISSED;
        break;
      case FlagResolutionAction.REMOVE_MARKET:
        await this.marketsRepository.update(flag.market_id, {
          is_cancelled: true,
        });
        break;
      case FlagResolutionAction.BAN_USER:
        await this.usersRepository.update(flag.user_id, {
          is_banned: true,
          ban_reason: `Banned due to flagged content: ${flag.reason}`,
          banned_at: new Date(),
          banned_by: adminId,
        });
        break;
    }

    const savedFlag = await this.flagsRepository.save(flag);

    await this.analyticsService.logActivity(adminId, 'FLAG_RESOLVED', {
      flag_id: flagId,
      action: resolveFlagDto.action,
      market_id: flag.market_id,
      user_id: flag.user_id,
    });

    return savedFlag;
  }
}
