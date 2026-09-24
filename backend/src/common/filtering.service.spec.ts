import { BadRequestException } from '@nestjs/common';
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  creatorEventFilterConfig,
  FilterCombination,
  FilteringService,
  matchFilterConfig,
  predictionFilterConfig,
} from './filtering.service';

describe('FilteringService', () => {
  let service: FilteringService;

  beforeEach(() => {
    service = new FilteringService();
  });

  it('builds date, status, numeric, address, boolean, and sort filters', () => {
    const plan = service.buildFilterPlan(creatorEventFilterConfig, {
      dateRanges: {
        created_at: {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-31T23:59:59.000Z',
        },
      },
      statuses: 'active',
      numericRanges: {
        participant_count: {
          min: '10',
          max: 50,
        },
      },
      addresses: {
        creator: '0xABCDEF',
      },
      booleans: {
        is_active: 'true',
      },
      sort: {
        field: 'created_at',
        direction: 'ASC',
      },
    });

    expect(plan.combination).toBe(FilterCombination.And);
    expect(plan.sort).toEqual({
      column: 'creatorEvent.created_at',
      direction: 'ASC',
    });
    expect(plan.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: 'creatorEvent.created_at >= :filter_0',
        }),
        expect.objectContaining({
          sql: 'creatorEvent.created_at <= :filter_1',
        }),
        expect.objectContaining({
          sql: 'creatorEvent.participant_count >= :filter_4',
        }),
        expect.objectContaining({
          sql: 'creatorEvent.participant_count <= :filter_5',
        }),
        expect.objectContaining({
          sql: 'LOWER(creatorEvent.creator_address) IN (:...filter_6)',
          parameters: { filter_6: ['0xabcdef'] },
        }),
        expect.objectContaining({
          sql: 'creatorEvent.is_active = :filter_7',
          parameters: { filter_7: true },
        }),
      ]),
    );
    expect(plan.clauses[2]).toEqual({
      sql: '((creatorEvent.is_active = :filter_2 AND creatorEvent.is_cancelled = :filter_3))',
      parameters: {
        filter_2: true,
        filter_3: false,
      },
    });
  });

  it('supports OR combinations and multiple statuses', () => {
    const plan = service.buildFilterPlan(creatorEventFilterConfig, {
      statuses: ['active', 'cancelled'],
      booleans: {
        is_active: false,
      },
      combination: FilterCombination.Or,
    });

    expect(plan.combination).toBe(FilterCombination.Or);
    expect(plan.clauses[0].sql).toBe(
      '((creatorEvent.is_active = :filter_0 AND creatorEvent.is_cancelled = :filter_1) OR (creatorEvent.is_cancelled = :filter_2))',
    );
    expect(plan.clauses[1]).toEqual({
      sql: 'creatorEvent.is_active = :filter_3',
      parameters: { filter_3: false },
    });
  });

  it('builds match filters for match time, completion status, and submitter', () => {
    const plan = service.buildFilterPlan(matchFilterConfig, {
      dateRanges: {
        match_time: {
          from: '2026-05-01T00:00:00.000Z',
        },
      },
      statuses: 'completed',
      addresses: {
        submitted_by: 'GCREATOR',
      },
      booleans: {
        result_submitted: true,
      },
      sort: {
        field: 'match_time',
      },
    });

    expect(plan.sort).toEqual({
      column: 'match.match_time',
      direction: 'DESC',
    });
    expect(plan.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sql: 'match.match_time >= :filter_0' }),
        {
          sql: '((match.result_submitted = :filter_1))',
          parameters: { filter_1: true },
        },
        {
          sql: 'LOWER(match.submitted_by) IN (:...filter_2)',
          parameters: { filter_2: ['gcreator'] },
        },
        {
          sql: 'match.result_submitted = :filter_3',
          parameters: { filter_3: true },
        },
      ]),
    );
  });

  it('builds prediction filters for participant, amount, submitted date, and payout status', () => {
    const plan = service.buildFilterPlan(predictionFilterConfig, {
      dateRanges: {
        submitted_at: {
          to: '2026-06-01T00:00:00.000Z',
        },
      },
      statuses: 'active',
      numericRanges: {
        stake_amount_stroops: {
          min: 100,
        },
      },
      addresses: {
        participant: ['GONE', 'GTWO'],
      },
      booleans: {
        payout_claimed: 'false',
      },
    });

    expect(plan.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: 'prediction.submitted_at <= :filter_0',
        }),
        {
          sql: '((prediction.payout_claimed = :filter_1))',
          parameters: { filter_1: false },
        },
        {
          sql: 'prediction.stake_amount_stroops >= :filter_2',
          parameters: { filter_2: 100 },
        },
        {
          sql: 'LOWER(user.stellar_address) IN (:...filter_3)',
          parameters: { filter_3: ['gone', 'gtwo'] },
        },
        {
          sql: 'prediction.payout_claimed = :filter_4',
          parameters: { filter_4: false },
        },
      ]),
    );
  });

  it('applies filter brackets and sorting to a TypeORM query builder', () => {
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    } as unknown as SelectQueryBuilder<ObjectLiteral>;

    const result = service.applyFilters(
      queryBuilder,
      creatorEventFilterConfig,
      {
        booleans: {
          is_cancelled: false,
        },
        sort: {
          field: 'participant_count',
          direction: 'DESC',
        },
      },
    );

    expect(result).toBe(queryBuilder);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'creatorEvent.participant_count',
      'DESC',
    );
  });

  it('rejects invalid filter values', () => {
    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        dateRanges: {
          created_at: {
            from: 'bad-date',
          },
        },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        numericRanges: {
          participant_count: {
            min: 'many',
          },
        },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        statuses: 'archived',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        booleans: {
          is_active: 'yes',
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid ranges, unsupported fields, and unsupported sorting', () => {
    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        dateRanges: {
          created_at: {
            from: '2026-02-01T00:00:00.000Z',
            to: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        numericRanges: {
          participant_count: {
            min: 100,
            max: 50,
          },
        },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        addresses: {
          participant: 'GABC',
        },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        sort: {
          field: 'creator',
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown filter field name with a validation error', () => {
    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        dateRanges: {
          unknown_field: {
            from: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        numericRanges: {
          unknown_field: {
            min: 1,
          },
        },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        addresses: {
          unknown_field: 'GABC',
        },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        booleans: {
          unknown_field: true,
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('builds the expected query plan when only whitelisted fields are used', () => {
    const plan = service.buildFilterPlan(creatorEventFilterConfig, {
      statuses: 'active',
      booleans: {
        is_active: true,
      },
      sort: {
        field: 'created_at',
        direction: 'ASC',
      },
    });

    expect(plan.combination).toBe(FilterCombination.And);
    expect(plan.sort).toEqual({
      column: 'creatorEvent.created_at',
      direction: 'ASC',
    });
    expect(plan.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: '((creatorEvent.is_active = :filter_0 AND creatorEvent.is_cancelled = :filter_1))',
        }),
        expect.objectContaining({
          sql: 'creatorEvent.is_active = :filter_2',
          parameters: { filter_2: true },
        }),
      ]),
    );
  });

  it('rejects the entire call when a mix of valid and invalid fields is provided', () => {
    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        statuses: 'active',
        booleans: {
          is_active: true,
        },
        numericRanges: {
          unknown_field: {
            min: 1,
          },
        },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.buildFilterPlan(creatorEventFilterConfig, {
        dateRanges: {
          created_at: {
            from: '2026-01-01T00:00:00.000Z',
          },
        },
        addresses: {
          unknown_field: 'GABC',
        },
      }),
    ).toThrow(BadRequestException);
  });
});
