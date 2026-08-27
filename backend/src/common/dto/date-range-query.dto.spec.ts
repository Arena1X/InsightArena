import { validate } from 'class-validator';
import {
  DateRangeQueryDto,
  DEFAULT_DATE_RANGE_DAYS,
  MAX_DATE_RANGE_DAYS,
} from './date-range-query.dto';

describe('DateRangeQueryDto', () => {
  const reference = new Date('2026-06-15T12:00:00.000Z');

  async function expectValid(dto: DateRangeQueryDto) {
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  }

  async function expectInvalid(dto: DateRangeQueryDto, message: string) {
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    const nestedMessages = errors.flatMap((error) =>
      (error.children ?? []).flatMap((child) =>
        Object.values(child.constraints ?? {}),
      ),
    );
    expect(
      [...messages, ...nestedMessages].some((entry) => entry.includes(message)),
    ).toBe(true);
  }

  it('defaults to the last 30 days when from and to are omitted', () => {
    const dto = new DateRangeQueryDto();
    const { from, to } = dto.resolveRange(reference);

    expect(to.toISOString()).toBe(reference.toISOString());
    expect(from.toISOString()).toBe(
      new Date('2026-05-16T12:00:00.000Z').toISOString(),
    );
    expect((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)).toBeCloseTo(
      DEFAULT_DATE_RANGE_DAYS,
      5,
    );
  });

  it('accepts a valid explicit range', async () => {
    const dto = new DateRangeQueryDto();
    dto.from = '2026-01-01T00:00:00.000Z';
    dto.to = '2026-01-31T23:59:59.999Z';

    await expectValid(dto);
  });

  it('rejects inverted ranges with from must be before to', async () => {
    const dto = new DateRangeQueryDto();
    dto.from = '2026-02-01T00:00:00.000Z';
    dto.to = '2026-01-01T00:00:00.000Z';

    await expectInvalid(dto, 'from must be before to');
  });

  it('clamps oversized ranges to the max lookback window', async () => {
    const dto = new DateRangeQueryDto();
    dto.from = '2020-01-01T00:00:00.000Z';
    dto.to = '2026-01-02T00:00:00.000Z';

    await expectValid(dto);

    const { from, to } = dto.resolveRange(new Date('2026-01-02T00:00:00.000Z'));
    const windowDays =
      (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);

    expect(windowDays).toBeLessThanOrEqual(MAX_DATE_RANGE_DAYS);
    expect(windowDays).toBeCloseTo(MAX_DATE_RANGE_DAYS, 5);
  });

  it('rejects future from dates', async () => {
    const dto = new DateRangeQueryDto();
    dto.from = '2099-01-01T00:00:00.000Z';
    dto.to = '2099-01-02T00:00:00.000Z';

    await expectInvalid(dto, 'from must not be in the future');
  });

  it('rejects future to dates', async () => {
    const dto = new DateRangeQueryDto();
    dto.from = '2026-01-01T00:00:00.000Z';
    dto.to = '2099-01-01T00:00:00.000Z';

    await expectInvalid(dto, 'to must not be in the future');
  });

  it('rejects inverted ranges when only from is provided and it is after now', async () => {
    const dto = new DateRangeQueryDto();
    dto.from = '2099-01-01T00:00:00.000Z';

    await expectInvalid(dto, 'from must not be in the future');
  });

  it('rejects malformed ISO date strings', async () => {
    const dto = new DateRangeQueryDto();
    dto.from = '2026-13-45T00:00:00.000Z';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('defaults from when only to is provided', () => {
    const dto = new DateRangeQueryDto();
    dto.to = '2026-06-10T00:00:00.000Z';

    const { from, to } = dto.resolveRange(reference);

    expect(to.toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect(from.toISOString()).toBe('2026-05-11T00:00:00.000Z');
  });

  it('defaults to now when only from is provided', () => {
    const dto = new DateRangeQueryDto();
    dto.from = '2026-06-01T00:00:00.000Z';

    const { from, to } = dto.resolveRange(reference);

    expect(from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(to.toISOString()).toBe(reference.toISOString());
  });
});
