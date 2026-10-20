import { HttpException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { MarketsService } from './markets.service';
import { MarketSettlementScheduler } from './market-settlement.scheduler';
import { Market } from './entities/market.entity';
import { Comment } from './entities/comment.entity';
import { MarketTemplate } from './entities/market-template.entity';
import { UserBookmark } from './entities/user-bookmark.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { MarketPriceSnapshot } from './entities/market-price-snapshot.entity';
import { SorobanService } from '../soroban/soroban.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { WebhookDispatcherService } from '../webhooks/services/webhook-dispatcher.service';
import { SearchService } from '../search/search.service';
import { CreateCommentDto } from './dto/create-comment.dto';

describe('MarketsService - Comments moderation and rate limiting', () => {
  let service: MarketsService;
  let marketsRepository: jest.Mocked<Pick<Repository<Market>, 'findOne'>>;
  let commentsRepository: jest.Mocked<
    Pick<Repository<Comment>, 'create' | 'save' | 'findOne' | 'findAndCount'>
  >;

  const mockUser = { id: 'user-1', stellar_address: 'GABC123' } as User;
  const mockMarket = { id: 'market-1' } as Market;

  const makeDto = (
    content = 'A perfectly normal comment',
  ): CreateCommentDto => ({
    content,
  });

  beforeEach(async () => {
    marketsRepository = {
      findOne: jest.fn().mockResolvedValue(mockMarket),
    };

    commentsRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
      findOne: jest.fn().mockResolvedValue(null), // no prior comment by default
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    } as any;

    const dataSource = {
      createQueryRunner: jest.fn(),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        { provide: getRepositoryToken(Market), useValue: marketsRepository },
        { provide: getRepositoryToken(Comment), useValue: commentsRepository },
        { provide: getRepositoryToken(MarketTemplate), useValue: {} },
        {
          provide: getRepositoryToken(UserBookmark),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(MarketPriceSnapshot),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        { provide: UsersService, useValue: {} },
        { provide: SorobanService, useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: WebhookDispatcherService, useValue: { emit: jest.fn() } },
        {
          provide: SearchService,
          useValue: { refreshMarketSearchVector: jest.fn() },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            reset: jest.fn(),
          },
        },
        {
          provide: MarketSettlementScheduler,
          useValue: {
            getDeadLetterQueue: jest.fn(),
            retrySettlement: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MarketsService>(MarketsService);
  });

  describe('rate limiting', () => {
    it('allows a comment when the user has never posted before', async () => {
      await expect(
        service.createComment('market-1', makeDto(), mockUser),
      ).resolves.toBeDefined();
    });

    it('allows a comment when the last one was posted long ago', async () => {
      commentsRepository.findOne.mockResolvedValueOnce({
        created_at: new Date(Date.now() - 60_000),
      } as Comment);

      await expect(
        service.createComment('market-1', makeDto(), mockUser),
      ).resolves.toBeDefined();
    });

    it('rejects a comment posted within the minimum interval of the last one', async () => {
      commentsRepository.findOne.mockResolvedValueOnce({
        created_at: new Date(),
      } as Comment);

      await expect(
        service.createComment('market-1', makeDto(), mockUser),
      ).rejects.toThrow(HttpException);
      expect(commentsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('moderation', () => {
    it('does not flag ordinary content', async () => {
      const comment = await service.createComment(
        'market-1',
        makeDto('Great prediction, looking forward to the result!'),
        mockUser,
      );

      expect(comment.is_flagged).toBe(false);
      expect(comment.flagged_reason).toBeNull();
    });

    it('soft-hides content containing profanity', async () => {
      const comment = await service.createComment(
        'market-1',
        makeDto('This market is complete shit honestly'),
        mockUser,
      );

      expect(comment.is_flagged).toBe(true);
      expect(comment.flagged_reason).toBe('profanity');
      // Soft-hidden, not rejected — the comment is still saved.
      expect(commentsRepository.save).toHaveBeenCalled();
    });

    it('soft-hides link-spam content', async () => {
      const comment = await service.createComment(
        'market-1',
        makeDto(
          'Check these out http://a.example http://b.example http://c.example',
        ),
        mockUser,
      );

      expect(comment.is_flagged).toBe(true);
      expect(comment.flagged_reason).toBe('link_spam');
    });
  });

  describe('getComments', () => {
    it('excludes flagged comments from the results', async () => {
      await service.getComments('market-1');

      expect(commentsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_flagged: false }),
        }),
      );
    });
  });

  it('rejects when the parent comment does not exist', async () => {
    commentsRepository.findOne
      .mockResolvedValueOnce(null) // rate-limit lookup: no prior comment
      .mockResolvedValueOnce(null); // parent lookup: not found

    await expect(
      service.createComment(
        'market-1',
        { content: 'reply', parentId: 'missing-parent' },
        mockUser,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
