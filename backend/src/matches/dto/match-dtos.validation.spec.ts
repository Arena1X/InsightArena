import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { WinningTeam } from '../entities/match.entity';
import { SubmitMatchResultDto } from './submit-match-result.dto';
import { MatchPredictionsQueryDto } from './match-predictions-query.dto';

const validateDto = async (
  payload: Record<string, unknown>,
  dtoClass: new () => object,
) => {
  const instance = plainToInstance(dtoClass, payload, {
    enableImplicitConversion: false,
  });
  return validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
};

describe('SubmitMatchResultDto', () => {
  const valid = {
    home_score: 2,
    away_score: 1,
    winning_team: WinningTeam.TEAM_A,
  };

  it('accepts a well-formed result payload', async () => {
    const errors = await validateDto(valid, SubmitMatchResultDto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a DRAW with equal scores and optional result_source', async () => {
    const errors = await validateDto(
      {
        home_score: 0,
        away_score: 0,
        winning_team: WinningTeam.DRAW,
        result_source: 'official feed',
      },
      SubmitMatchResultDto,
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects negative scores with a field-level error', async () => {
    const errors = await validateDto(
      { ...valid, home_score: -1 },
      SubmitMatchResultDto,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('home_score');
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('rejects non-integer scores with field-level errors', async () => {
    for (const bad of [1.5, 'two', Number.NaN]) {
      const errors = await validateDto(
        { ...valid, away_score: bad },
        SubmitMatchResultDto,
      );
      expect(errors.some((e) => e.property === 'away_score')).toBe(true);
    }
  });

  it('rejects missing scores', async () => {
    const errors = await validateDto(
      { winning_team: WinningTeam.TEAM_A },
      SubmitMatchResultDto,
    );
    const props = errors.map((e) => e.property);
    expect(props).toContain('home_score');
    expect(props).toContain('away_score');
  });

  it('rejects invalid winning_team values with an enum constraint error', async () => {
    const errors = await validateDto(
      { ...valid, winning_team: 'TEAM_C' },
      SubmitMatchResultDto,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('winning_team');
    expect(Object.keys(errors[0].constraints!)).toContain('isEnum');
  });

  it('rejects empty or oversized result_source', async () => {
    const empty = await validateDto(
      { ...valid, result_source: '' },
      SubmitMatchResultDto,
    );
    expect(empty.some((e) => e.property === 'result_source')).toBe(true);

    const tooLong = await validateDto(
      { ...valid, result_source: 'x'.repeat(256) },
      SubmitMatchResultDto,
    );
    expect(tooLong.some((e) => e.property === 'result_source')).toBe(true);
  });

  it('strips unknown properties (forbidNonWhitelisted)', async () => {
    const errors = await validateDto(
      { ...valid, admin_override: true },
      SubmitMatchResultDto,
    );
    expect(errors.some((e) => e.property === 'admin_override')).toBe(true);
  });
});

describe('MatchPredictionsQueryDto', () => {
  it('applies defaults when omitted', async () => {
    const errors = await validateDto({}, MatchPredictionsQueryDto);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid pagination parameters', async () => {
    const errors = await validateDto(
      { includeUsers: true, page: '3', limit: '50' },
      MatchPredictionsQueryDto,
    );
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['page must be >= 1', { page: '0' }, 'page'],
    ['limit must be <= 50', { limit: '51' }, 'limit'],
    ['non-integer page rejected', { page: 'abc' }, 'page'],
    ['non-integer limit rejected', { limit: '1.5' }, 'limit'],
    ['unknown query param rejected', { sort: 'desc' }, 'sort'],
  ])('%s', async (_label, payload, expectedProp) => {
    const errors = await validateDto(payload, MatchPredictionsQueryDto);
    expect(errors.some((e) => e.property === expectedProp)).toBe(true);
  });

  it('coerces includeUsers from its query-string form', async () => {
    const instance = plainToInstance(MatchPredictionsQueryDto, {
      includeUsers: 'true',
    });
    const errors = await validate(instance, { whitelist: true });
    expect(errors).toHaveLength(0);
    expect(instance.includeUsers).toBe(true);
  });
});
