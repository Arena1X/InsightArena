import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { SeasonsService } from './seasons.service';
import { Season } from './entities/season.entity';
import { User } from '../users/entities/user.entity';
import {
  DistributionLedgerStatus,
  SeasonDistributionLedgerEntry,
} from './entities/season-distribution-ledger.entity';
import { SorobanService } from '../soroban/soroban.service';
import { WebhookDispatcherService } from '../webhooks/services/webhook-dispatcher.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { SeasonStatus } from './dto/list-seasons.dto';

describe('SeasonsService', () => {
  let service: SeasonsService;
  let seasonsRepository: jest.Mocked<
    Pick<
      Repository<Season>,
      'find' | 'exist' | 'create' | 'save' | 'remove' | 'createQueryBuilder'
    >
  >;
  let sorobanService: { createSeason: jest.Mock };
  let notificationsService: { create: jest.Mock };
  let distributionLedgerRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    seasonsRepository = {
      find: jest.fn(),
      exist: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    sorobanService = {
      createSeason: jest.fn(),
    };

    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    distributionLedgerRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest
        .fn()
        .mockImplementation(async (v) => ({ id: 'ledger-1', ...v })),
      update: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonsService,
        { provide: getRepositoryToken(Season), useValue: seasonsRepository },
        {
          provide: getRepositoryToken(SeasonDistributionLedgerEntry),
          useValue: distributionLedgerRepository,
        },
        { provide: SorobanService, useValue: sorobanService },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn().mockResolvedValue(undefined),
              startTransaction: jest.fn().mockResolvedValue(undefined),
              manager: {
                findOne: jest.fn(),
                save: jest.fn(),
                update: jest.fn(),
              },
              commitTransaction: jest.fn().mockResolvedValue(undefined),
              rollbackTransaction: jest.fn().mockResolvedValue(undefined),
              release: jest.fn().mockResolvedValue(undefined),
            }),
          },
        },
        {
          provide: WebhookDispatcherService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(SeasonsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllPaginated', () => {
    it('returns data with top_winner for finalized seasons', async () => {
      const winner = {
        id: 'user-winner',
        username: 'top1',
        stellar_address: 'GABCDEF123456789012345678901234',
      };
      const s1: Season = {
        id: 's1',
        season_number: 3,
        name: 'Season 3',
        starts_at: new Date('2025-01-01'),
        ends_at: new Date('2025-12-31'),
        reward_pool_stroops: '100',
        is_active: false,
        is_finalized: true,
        participant_count: 0,
        top_winner: winner as Season['top_winner'],
        on_chain_season_id: null,
        soroban_tx_hash: null,
        rollover_processed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const getManyAndCount = jest.fn().mockResolvedValue([[s1], 15]);
      seasonsRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount,
      } as never);

      const result = await service.findAllPaginated({ page: 1, limit: 5 });

      expect(result.total).toBe(15);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].top_winner).toEqual({
        user_id: 'user-winner',
        username: 'top1',
        stellar_address: 'GABCDEF123456789012345678901234',
      });
      expect(seasonsRepository.createQueryBuilder).toHaveBeenCalledWith(
        'season',
      );
    });

    it('hides top_winner when season is not finalized', async () => {
      const winner = {
        id: 'user-winner',
        username: 'x',
        stellar_address: 'GX',
      };
      const s1: Season = {
        id: 's1',
        season_number: 1,
        name: 'Season 1',
        starts_at: new Date(),
        ends_at: new Date(),
        reward_pool_stroops: '1',
        is_active: true,
        is_finalized: false,
        participant_count: 0,
        top_winner: winner as Season['top_winner'],
        on_chain_season_id: null,
        soroban_tx_hash: null,
        rollover_processed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      seasonsRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[s1], 1]),
      } as never);

      const result = await service.findAllPaginated({ page: 1, limit: 20 });
      expect(result.data[0].top_winner).toBeNull();
    });

    it('caps limit at 50', async () => {
      const take = jest.fn().mockReturnThis();
      const getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
      seasonsRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take,
        getManyAndCount,
      } as never);

      await service.findAllPaginated({ page: 1, limit: 999 });

      expect(take).toHaveBeenCalledWith(50);
    });

    it.each([
      {
        status: SeasonStatus.Active,
        clause: 'season.is_active = :isActive',
      },
      {
        status: SeasonStatus.Upcoming,
        clause: 'season.starts_at > :now',
      },
      {
        status: SeasonStatus.Finalized,
        clause: 'season.is_finalized = :isFinalized',
      },
    ])('applies the $status status filter', async ({ status, clause }) => {
      const andWhere = jest.fn().mockReturnThis();
      seasonsRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere,
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      } as never);

      await service.findAllPaginated({ page: 1, limit: 20, status });

      expect(andWhere).toHaveBeenCalledWith(clause, expect.any(Object));
    });

    it('sorts seasons by start date descending', async () => {
      const orderBy = jest.fn().mockReturnThis();
      seasonsRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy,
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      } as never);

      await service.findAllPaginated({ page: 1, limit: 20 });

      expect(orderBy).toHaveBeenCalledWith('season.starts_at', 'DESC');
    });
  });

  describe('findActive', () => {
    it('returns the season when one matches the current time window', async () => {
      const active: Season = {
        id: 'a1',
        season_number: 1,
        name: 'Season 1',
        starts_at: new Date('2020-01-01'),
        ends_at: new Date('2099-01-01'),
        reward_pool_stroops: '1',
        is_active: true,
        is_finalized: false,
        top_winner: null,
        on_chain_season_id: null,
        soroban_tx_hash: null,
        rollover_processed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(active),
      } as never);

      const result = await service.findActive();

      expect(result).toEqual(active);
    });

    it('throws NotFoundException when no season matches', async () => {
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as never);

      await expect(service.findActive()).rejects.toEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            'marked active and whose start and end times include the current moment',
          ) as unknown as string,
        }),
      );
    });

    it('throws NotFoundException when no season at all exists in database', async () => {
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as never);

      await expect(service.findActive()).rejects.toThrow(NotFoundException);
      await expect(service.findActive()).rejects.toThrow(
        'No active season exists',
      );
    });

    it('throws NotFoundException when season exists but window has not started yet', async () => {
      const futureStart = new Date();
      futureStart.setFullYear(futureStart.getFullYear() + 1);
      const futureEnd = new Date(futureStart);
      futureEnd.setMonth(futureEnd.getMonth() + 6);

      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as never);

      await expect(service.findActive()).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when season exists but has already ended', async () => {
      const pastStart = new Date();
      pastStart.setFullYear(pastStart.getFullYear() - 2);
      const pastEnd = new Date();
      pastEnd.setFullYear(pastEnd.getFullYear() - 1);

      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as never);

      await expect(service.findActive()).rejects.toThrow(NotFoundException);
    });

    it('returns the season with latest starts_at when multiple active seasons overlap', async () => {
      const olderSeason: Season = {
        id: 's1',
        season_number: 1,
        name: 'Season 1',
        starts_at: new Date('2020-01-01'),
        ends_at: new Date('2099-01-01'),
        reward_pool_stroops: '1',
        is_active: true,
        is_finalized: false,
        top_winner: null,
        on_chain_season_id: null,
        soroban_tx_hash: null,
        rollover_processed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const newerSeason: Season = {
        id: 's2',
        season_number: 2,
        name: 'Season 2',
        starts_at: new Date('2022-01-01'),
        ends_at: new Date('2099-01-01'),
        reward_pool_stroops: '1',
        is_active: true,
        is_finalized: false,
        top_winner: null,
        on_chain_season_id: null,
        soroban_tx_hash: null,
        rollover_processed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(newerSeason),
      } as never);

      const result = await service.findActive();

      expect(result).toEqual(newerSeason);
    });
  });

  describe('create', () => {
    const dto: CreateSeasonDto = {
      season_number: 2,
      start_time: '2030-01-01T00:00:00.000Z',
      end_time: '2030-06-01T00:00:00.000Z',
      reward_pool_stroops: '1000000',
    };

    const savedSeason: Season = {
      id: 'season-uuid',
      season_number: 2,
      name: 'Season 2',
      starts_at: new Date(dto.start_time),
      ends_at: new Date(dto.end_time),
      reward_pool_stroops: dto.reward_pool_stroops,
      is_active: false,
      is_finalized: false,
      participant_count: 0,
      top_winner: null,
      on_chain_season_id: null,
      soroban_tx_hash: null,
      rollover_processed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    beforeEach(() => {
      seasonsRepository.exist.mockResolvedValue(false);
      seasonsRepository.create.mockImplementation((x) => x as Season);
      seasonsRepository.save.mockResolvedValue(savedSeason);
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      } as never);
    });

    it('persists season without Soroban by default', async () => {
      const result = await service.create(dto);

      expect(seasonsRepository.exist).toHaveBeenCalledWith({
        where: { season_number: 2 },
      });
      expect(seasonsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          season_number: 2,
          name: 'Season 2',
          reward_pool_stroops: '1000000',
          is_active: false,
          is_finalized: false,
        }),
      );
      expect(seasonsRepository.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(savedSeason);
      expect(sorobanService.createSeason).not.toHaveBeenCalled();
    });

    it('throws when season_number exists', async () => {
      seasonsRepository.exist.mockResolvedValue(true);

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(seasonsRepository.save).not.toHaveBeenCalled();
    });

    it('rejects specific overlapping windows and allows back-to-back creation', async () => {
      // Existing active season window: [100, 200]
      const now = new Date('2030-01-01T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      // Utility: mock overlap result based on candidate range, driven by
      // hasActiveSeasonOverlappingRange -> getCount().
      // Overlap condition in SeasonsService:
      //   s.starts_at < end AND s.ends_at > start
      // So we return 1 when overlapping, else 0.
      const overlapFor = (start: number, end: number) => {
        const existingStart = 100;
        const existingEnd = 200;
        return existingStart < end && existingEnd > start ? 1 : 0;
      };

      seasonsRepository.createQueryBuilder.mockImplementation(() => {
        return {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          // getCount is set per call below
          getCount: jest.fn(),
        } as never;
      });

      const mkDto = (seasonNumber: number, start: number, end: number) => {
        // Use dates with deterministic parsing; seconds value isn't used,
        // only the overlap math in the SQL query bindings.
        const startIso = new Date(start * 1000).toISOString();
        const endIso = new Date(end * 1000).toISOString();
        return {
          season_number: seasonNumber,
          start_time: startIso,
          end_time: endIso,
          reward_pool_stroops: dto.reward_pool_stroops,
        } satisfies CreateSeasonDto;
      };

      const attempts = [
        {
          label: '[150, 250] starts inside => reject',
          start: 150,
          end: 250,
          ok: false,
          season: 10,
        },
        {
          label: '[50, 150] ends inside => reject',
          start: 50,
          end: 150,
          ok: false,
          season: 11,
        },
        {
          label: '[120, 180] fully inside => reject',
          start: 120,
          end: 180,
          ok: false,
          season: 12,
        },
        {
          label: '[200, 300] starts at end => success',
          start: 200,
          end: 300,
          ok: true,
          season: 13,
        },
      ] as const;

      for (const a of attempts) {
        const qb = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getCount: jest.fn().mockResolvedValue(overlapFor(a.start, a.end)),
        } as never;
        seasonsRepository.createQueryBuilder.mockReturnValue(qb);

        if (!a.ok) {
          await expect(
            service.create(mkDto(a.season, a.start, a.end)),
          ).rejects.toBeInstanceOf(ConflictException);
          expect(seasonsRepository.save).not.toHaveBeenCalled();
        } else {
          seasonsRepository.save.mockResolvedValueOnce({
            ...savedSeason,
            season_number: a.season,
          });

          const result = await service.create(mkDto(a.season, a.start, a.end));
          expect(result.season_number).toBe(a.season);
          expect(seasonsRepository.save).toHaveBeenCalled();
        }
      }

      // Finalize existing season; the existing active season should no longer
      // overlap checks against is_active=true.
      // Simulate by returning 0 overlap for [150, 250].
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      } as never);

      seasonsRepository.save.mockResolvedValueOnce({
        ...savedSeason,
        season_number: 99,
      });
      const finalResult = await service.create(mkDto(99, 150, 250));
      expect(finalResult.season_number).toBe(99);

      jest.useRealTimers();
    });

    it('throws when an active season overlaps the range (generic)', async () => {
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      } as never);

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(seasonsRepository.save).not.toHaveBeenCalled();
    });

    it('calls Soroban when sync_soroban is true', async () => {
      sorobanService.createSeason.mockResolvedValue({
        on_chain_season_id: 42,
        tx_hash: 'abc',
      });

      const withSync = { ...dto, sync_soroban: true };
      const afterChain = {
        ...savedSeason,
        on_chain_season_id: 42,
        soroban_tx_hash: 'abc',
      };
      seasonsRepository.save
        .mockResolvedValueOnce(savedSeason)
        .mockResolvedValueOnce(afterChain);

      const result = await service.create(withSync);

      expect(sorobanService.createSeason).toHaveBeenCalledWith(
        Math.floor(new Date(dto.start_time).getTime() / 1000),
        Math.floor(new Date(dto.end_time).getTime() / 1000),
        dto.reward_pool_stroops,
      );
      expect(seasonsRepository.save).toHaveBeenCalledTimes(2);
      expect(result.on_chain_season_id).toBe(42);
    });

    it('removes season when Soroban fails after save', async () => {
      sorobanService.createSeason.mockRejectedValue(new Error('rpc down'));
      seasonsRepository.save.mockResolvedValue(savedSeason);

      await expect(
        service.create({ ...dto, sync_soroban: true }),
      ).rejects.toThrow('rpc down');

      expect(seasonsRepository.remove).toHaveBeenCalledWith(savedSeason);
    });
  });

  describe('processSeasonRollover', () => {
    const ending: Season = {
      id: 'end-1',
      season_number: 1,
      name: 'Season 1',
      starts_at: new Date('2020-01-01T00:00:00.000Z'),
      ends_at: new Date('2020-06-01T00:00:00.000Z'),
      reward_pool_stroops: '1000',
      is_active: true,
      is_finalized: false,
      participant_count: 0,
      top_winner: null,
      on_chain_season_id: null,
      soroban_tx_hash: null,
      rollover_processed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const nextSeason: Season = {
      id: 'next-1',
      season_number: 2,
      name: 'Season 2',
      starts_at: new Date('2020-06-01T00:00:00.000Z'),
      ends_at: new Date('2020-12-01T00:00:00.000Z'),
      reward_pool_stroops: '2000',
      is_active: false,
      is_finalized: false,
      participant_count: 0,
      top_winner: null,
      on_chain_season_id: null,
      soroban_tx_hash: null,
      rollover_processed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    function buildTransactionalManager(overrides: {
      season: Season;
      winner: {
        id: string;
        stellar_address: string;
        season_points: number;
      } | null;
      finalized: Season;
      opened: Season | null;
      standings: { u_id: string; season_points: number }[];
      snapshotExists?: boolean;
    }) {
      const savedSnapshots: unknown[] = [];
      const manager = {
        findOne: jest
          .fn()
          .mockImplementation(
            async (
              entity: unknown,
              opts: { where?: { id?: string; season_number?: number } },
            ) => {
              if (entity === Season) {
                if (opts?.where?.id === overrides.season.id) {
                  return { ...overrides.season };
                }
                if (
                  opts?.where?.season_number ===
                  overrides.season.season_number + 1
                ) {
                  return overrides.opened;
                }
                return null;
              }
              if (entity === User) {
                return overrides.winner;
              }
              return null;
            },
          ),
        save: jest
          .fn()
          .mockImplementation(async (entity: unknown, value: unknown) => {
            if (entity === Season) {
              const v = value as Season;
              return v.id === overrides.season.id ? overrides.finalized : v;
            }
            if (Array.isArray(value)) {
              savedSnapshots.push(...value);
            }
            return value;
          }),
        update: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockResolvedValue(overrides.snapshotExists ?? false),
        create: jest.fn().mockImplementation((_entity, value) => value),
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue(overrides.standings),
          getOne: jest.fn().mockResolvedValue(null),
        }),
      };
      return { manager, savedSnapshots };
    }

    it('closes ending season, opens next, and is idempotent on re-run', async () => {
      const now = new Date('2020-06-01T00:00:00.000Z');
      const winner = {
        id: 'u1',
        username: 'winner',
        stellar_address: 'GWINNER',
        season_points: 10,
      };
      const finalized: Season = {
        ...ending,
        is_active: false,
        is_finalized: true,
        rollover_processed_at: now,
        top_winner: winner as Season['top_winner'],
      };

      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(ending),
      } as never);

      const { manager, savedSnapshots } = buildTransactionalManager({
        season: ending,
        winner,
        finalized,
        opened: nextSeason,
        standings: [{ u_id: 'u1', season_points: 10 }],
      });
      const qr = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        manager,
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
      };
      (
        service as unknown as { dataSource: { createQueryRunner: jest.Mock } }
      ).dataSource.createQueryRunner = jest.fn().mockReturnValue(qr);

      seasonsRepository.findOne = jest
        .fn()
        .mockImplementation(
          async (opts: { where?: { id?: string; season_number?: number } }) => {
            if (opts?.where?.id === 'end-1') return finalized;
            if (opts?.where?.season_number === 2) return nextSeason;
            return null;
          },
        );

      seasonsRepository.save = jest
        .fn()
        .mockImplementation(async (s: Season) => s);

      const first = await service.processSeasonRollover(now);
      expect(first.skipped).toBe(false);
      expect(first.closedSeasonId).toBe('end-1');
      expect(first.openedSeasonId).toBe('next-1');
      expect(first.rewardsComputed).toBe(true);
      expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
      expect(qr.rollbackTransaction).not.toHaveBeenCalled();
      // Exactly one snapshot row written for the closed season's sole standing.
      expect(savedSnapshots).toHaveLength(1);
      expect(savedSnapshots[0]).toMatchObject({
        rank: 1,
        season_points: 10,
        user: { id: 'u1' },
      });

      // Second run with already-processed ending season filtered out.
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as never);

      const second = await service.processSeasonRollover(now);
      expect(second.skipped).toBe(true);
      expect(second.reason).toBe('nothing_to_rollover');
    });

    it('does not duplicate the snapshot when re-run inside the transaction finds one already exists', async () => {
      const now = new Date('2020-06-01T00:00:00.000Z');
      const winner = {
        id: 'u1',
        username: 'winner',
        stellar_address: 'GWINNER',
        season_points: 10,
      };
      const finalized: Season = {
        ...ending,
        is_active: false,
        is_finalized: true,
        rollover_processed_at: now,
        top_winner: winner as Season['top_winner'],
      };

      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(ending),
      } as never);

      const { manager, savedSnapshots } = buildTransactionalManager({
        season: ending,
        winner,
        finalized,
        opened: nextSeason,
        standings: [{ u_id: 'u1', season_points: 10 }],
        snapshotExists: true,
      });
      const qr = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        manager,
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
      };
      (
        service as unknown as { dataSource: { createQueryRunner: jest.Mock } }
      ).dataSource.createQueryRunner = jest.fn().mockReturnValue(qr);

      seasonsRepository.findOne = jest.fn().mockResolvedValue(finalized);
      seasonsRepository.save = jest
        .fn()
        .mockImplementation(async (s: Season) => s);

      await service.processSeasonRollover(now);

      expect(manager.exists).toHaveBeenCalledTimes(1);
      expect(savedSnapshots).toHaveLength(0);
    });

    it('rolls back the whole transaction if the leaderboard snapshot write fails', async () => {
      const now = new Date('2020-06-01T00:00:00.000Z');
      const winner = {
        id: 'u1',
        username: 'winner',
        stellar_address: 'GWINNER',
        season_points: 10,
      };
      const finalized: Season = {
        ...ending,
        is_active: false,
        is_finalized: true,
        rollover_processed_at: now,
        top_winner: winner as Season['top_winner'],
      };

      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(ending),
      } as never);

      const { manager } = buildTransactionalManager({
        season: ending,
        winner,
        finalized,
        opened: nextSeason,
        standings: [{ u_id: 'u1', season_points: 10 }],
      });
      manager.save = jest
        .fn()
        .mockImplementation(async (entity: unknown, value: unknown) => {
          if (entity === Season) {
            const v = value as Season;
            return v.id === ending.id ? finalized : v;
          }
          throw new Error('snapshot write failed');
        });
      const qr = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        manager,
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
      };
      (
        service as unknown as { dataSource: { createQueryRunner: jest.Mock } }
      ).dataSource.createQueryRunner = jest.fn().mockReturnValue(qr);

      await expect(service.processSeasonRollover(now)).rejects.toThrow(
        'snapshot write failed',
      );

      expect(qr.commitTransaction).not.toHaveBeenCalled();
      expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
      // Standings must not be reset if the snapshot never committed.
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('skips when rollover_processed_at is already set on ending season', async () => {
      const processed = {
        ...ending,
        rollover_processed_at: new Date('2020-06-01T00:00:00.000Z'),
      };
      // Query filters rollover_processed_at IS NULL, so getOne returns null
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as never);

      const result = await service.processSeasonRollover(
        new Date('2020-06-02T00:00:00.000Z'),
      );
      expect(result.skipped).toBe(true);
      expect(processed.rollover_processed_at).toBeTruthy();
    });
  });

  describe('computeSeasonRewards', () => {
    const winner = {
      id: 'winner-1',
      username: 'winner',
      stellar_address: 'GWINNER',
      season_points: 10,
    } as Season['top_winner'];

    const season: Season = {
      id: 'season-1',
      season_number: 1,
      name: 'Season 1',
      starts_at: new Date('2020-01-01T00:00:00.000Z'),
      ends_at: new Date('2020-06-01T00:00:00.000Z'),
      reward_pool_stroops: '100',
      is_active: false,
      is_finalized: true,
      participant_count: 0,
      top_winner: winner,
      on_chain_season_id: null,
      soroban_tx_hash: null,
      rollover_processed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('writes a PENDING ledger row before payout and marks it SUCCEEDED after', async () => {
      await service.computeSeasonRewards(season);

      expect(distributionLedgerRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DistributionLedgerStatus.PENDING,
          amount_stroops: '100',
          recipient_stellar_address: 'GWINNER',
        }),
      );
      expect(notificationsService.create).toHaveBeenCalled();
      expect(distributionLedgerRepository.update).toHaveBeenCalledWith(
        'ledger-1',
        expect.objectContaining({ status: DistributionLedgerStatus.SUCCEEDED }),
      );
    });

    it('resumes without re-paying when a SUCCEEDED ledger row already exists for the recipient', async () => {
      distributionLedgerRepository.findOne.mockResolvedValue({
        id: 'existing-id',
        status: DistributionLedgerStatus.SUCCEEDED,
      });

      const result = await service.computeSeasonRewards(season);

      expect(result).toBe(true);
      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(distributionLedgerRepository.save).not.toHaveBeenCalled();
    });

    it('marks the ledger row FAILED and rethrows when the payout step throws', async () => {
      notificationsService.create.mockRejectedValue(new Error('boom'));

      await expect(service.computeSeasonRewards(season)).rejects.toThrow(
        'boom',
      );

      expect(distributionLedgerRepository.update).toHaveBeenCalledWith(
        'ledger-1',
        expect.objectContaining({
          status: DistributionLedgerStatus.FAILED,
          failure_reason: 'boom',
        }),
      );
    });

    it('retries a previously FAILED ledger row instead of creating a duplicate', async () => {
      distributionLedgerRepository.findOne.mockResolvedValue({
        id: 'failed-id',
        status: DistributionLedgerStatus.FAILED,
      });

      await service.computeSeasonRewards(season);

      expect(distributionLedgerRepository.save).not.toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalled();
      expect(distributionLedgerRepository.update).toHaveBeenCalledWith(
        'failed-id',
        expect.objectContaining({ status: DistributionLedgerStatus.SUCCEEDED }),
      );
    });
  });

  describe('reconcileSeasonDistribution', () => {
    it('reconciles total distributed against the pool and flags a mismatch', async () => {
      distributionLedgerRepository.find.mockResolvedValue([
        { amount_stroops: '40', status: DistributionLedgerStatus.SUCCEEDED },
      ]);

      const result = await service.reconcileSeasonDistribution(
        'season-1',
        100n,
      );

      expect(result.matches).toBe(false);
      expect(result.totalDistributed).toBe('40');
    });

    it('reports a match when the distributed total equals the pool', async () => {
      distributionLedgerRepository.find.mockResolvedValue([
        { amount_stroops: '60', status: DistributionLedgerStatus.SUCCEEDED },
        { amount_stroops: '40', status: DistributionLedgerStatus.SUCCEEDED },
      ]);

      const result = await service.reconcileSeasonDistribution(
        'season-1',
        100n,
      );

      expect(result.matches).toBe(true);
      expect(result.totalDistributed).toBe('100');
    });
  });
});
