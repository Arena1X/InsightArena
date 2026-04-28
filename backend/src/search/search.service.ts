import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import {
  Competition,
  CompetitionVisibility,
} from '../competitions/entities/competition.entity';
import {
  GlobalSearchDto,
  GlobalSearchResponseDto,
  SearchType,
} from './dto/global-search.dto';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Competition)
    private readonly competitionsRepository: Repository<Competition>,
  ) {}

  async search(dto: GlobalSearchDto): Promise<GlobalSearchResponseDto> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);
    const skip = (page - 1) * limit;
    const searchType = dto.type ?? SearchType.All;
    const searchPattern = `%${dto.query}%`;

    const [markets, users, competitions] = await Promise.all([
      searchType === SearchType.All || searchType === SearchType.Markets
        ? this.searchMarkets(searchPattern, skip, limit)
        : Promise.resolve([]),
      searchType === SearchType.All || searchType === SearchType.Users
        ? this.searchUsers(searchPattern, skip, limit)
        : Promise.resolve([]),
      searchType === SearchType.All || searchType === SearchType.Competitions
        ? this.searchCompetitions(searchPattern, skip, limit)
        : Promise.resolve([]),
    ]);

    const total = markets.length + users.length + competitions.length;

    return { markets, users, competitions, total, page, limit };
  }

  private async searchMarkets(
    pattern: string,
    skip: number,
    limit: number,
  ): Promise<Market[]> {
    return this.marketsRepository
      .createQueryBuilder('market')
      .select([
        'market.id',
        'market.title',
        'market.description',
        'market.category',
        'market.is_resolved',
        'market.is_public',
        'market.participant_count',
        'market.created_at',
      ])
      .where('market.is_public = :isPublic', { isPublic: true })
      .andWhere(
        '(market.title ILIKE :pattern OR market.description ILIKE :pattern)',
        { pattern },
      )
      .orderBy('market.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();
  }

  private async searchUsers(
    pattern: string,
    skip: number,
    limit: number,
  ): Promise<User[]> {
    return this.usersRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.username',
        'user.stellar_address',
        'user.avatar_url',
        'user.reputation_score',
        'user.total_predictions',
      ])
      .where('user.is_banned = :banned', { banned: false })
      .andWhere(
        '(user.username ILIKE :pattern OR user.stellar_address ILIKE :pattern)',
        { pattern },
      )
      .orderBy('user.reputation_score', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();
  }

  private async searchCompetitions(
    pattern: string,
    skip: number,
    limit: number,
  ): Promise<Competition[]> {
    return this.competitionsRepository
      .createQueryBuilder('competition')
      .select([
        'competition.id',
        'competition.title',
        'competition.description',
        'competition.start_time',
        'competition.end_time',
        'competition.participant_count',
        'competition.visibility',
      ])
      .where('competition.visibility = :visibility', {
        visibility: CompetitionVisibility.Public,
      })
      .andWhere(
        '(competition.title ILIKE :pattern OR competition.description ILIKE :pattern)',
        { pattern },
      )
      .orderBy('competition.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();
  }
}
