import { validate } from 'class-validator';
import { CreateMarketDto, MarketCategory } from './create-market.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fully valid DTO instance that every happy-path test reuses. */
function buildValidDto(
  overrides: Partial<CreateMarketDto> = {},
): CreateMarketDto {
  const dto = new CreateMarketDto();
  dto.title = 'Will BTC reach $100k by 2030?';
  dto.description =
    'A prediction market about Bitcoin price in 2030. This is long enough.';
  dto.category = MarketCategory.Crypto;
  dto.outcome_options = ['Yes', 'No'];
  dto.end_time = '2099-12-31T23:59:59.000Z';
  dto.resolution_time = '2100-01-07T23:59:59.000Z';
  dto.creator_fee_bps = 100;
  dto.min_stake_stroops = '10000000';
  dto.max_stake_stroops = '1000000000';
  dto.is_public = true;
  return Object.assign(dto, overrides);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CreateMarketDto', () => {
  // ── Happy path ─────────────────────────────────────────────────────────
  describe('valid payload (happy path)', () => {
    it('produces zero validation errors', async () => {
      const dto = buildValidDto();
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ── title ──────────────────────────────────────────────────────────────
  describe('title', () => {
    it('fails when title is empty (minLength)', async () => {
      const dto = buildValidDto({ title: '' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('title');
      expect(errors[0].constraints).toHaveProperty('minLength');
    });

    it('fails when title is too short (minLength)', async () => {
      const dto = buildValidDto({ title: 'abc' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('title');
      expect(errors[0].constraints).toHaveProperty('minLength');
    });

    it('fails when title exceeds max length (maxLength)', async () => {
      const dto = buildValidDto({ title: 'X'.repeat(201) });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('title');
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });

    it('fails when title is not a string (isString)', async () => {
      const dto = buildValidDto({ title: 123 as any });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('title');
      expect(errors[0].constraints).toHaveProperty('isString');
    });
  });

  // ── description ────────────────────────────────────────────────────────
  describe('description', () => {
    it('fails when description is too short (minLength)', async () => {
      const dto = buildValidDto({ description: 'short' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('description');
      expect(errors[0].constraints).toHaveProperty('minLength');
    });

    it('fails when description exceeds max length (maxLength)', async () => {
      const dto = buildValidDto({ description: 'X'.repeat(2001) });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('description');
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });

    it('fails when description is not a string (isString)', async () => {
      const dto = buildValidDto({ description: 456 as any });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('description');
      expect(errors[0].constraints).toHaveProperty('isString');
    });
  });

  // ── category ───────────────────────────────────────────────────────────
  describe('category', () => {
    it('fails when category is not a valid enum value (isEnum)', async () => {
      const dto = buildValidDto({ category: 'InvalidCategory' as any });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('category');
      expect(errors[0].constraints).toHaveProperty('isEnum');
    });
  });

  // ── outcome_options ────────────────────────────────────────────────────
  describe('outcome_options', () => {
    it('fails when outcome_options is missing / undefined (isArray)', async () => {
      const dto = buildValidDto({ outcome_options: undefined as any });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('outcome_options');
      expect(errors[0].constraints).toHaveProperty('isArray');
    });

    it('fails when outcome_options has fewer than 2 items (arrayMinSize)', async () => {
      const dto = buildValidDto({ outcome_options: ['Yes'] });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('outcome_options');
      expect(errors[0].constraints).toHaveProperty('arrayMinSize');
    });

    it('fails when outcome_options exceeds max of 10 items (arrayMaxSize)', async () => {
      const dto = buildValidDto({
        outcome_options: Array.from({ length: 11 }, (_, i) => `Option ${i}`),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('outcome_options');
      expect(errors[0].constraints).toHaveProperty('arrayMaxSize');
    });

    it('fails when an outcome item is not a string (isString each)', async () => {
      const dto = buildValidDto({ outcome_options: ['Yes', 42 as any] });
      const errors = await validate(dto);
      // Note: each:true creates a nested error per invalid item
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const outcomeError = errors.find((e) => e.property === 'outcome_options');
      expect(outcomeError).toBeDefined();
    });

    it('allows duplicate outcome labels (no uniqueness constraint)', async () => {
      // The DTO does not have @ArrayUnique, so duplicates are accepted.
      const dto = buildValidDto({ outcome_options: ['Yes', 'Yes'] });
      const errors = await validate(dto);
      // Only 0 errors expected — no uniqueness decorator rejects duplicates
      expect(errors).toHaveLength(0);
    });
  });

  // ── end_time ───────────────────────────────────────────────────────────
  describe('end_time', () => {
    it('fails when end_time is in the past (isFutureDate)', async () => {
      const dto = buildValidDto({ end_time: '2020-01-01T00:00:00.000Z' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('end_time');
      expect(errors[0].constraints).toHaveProperty('isFutureDate');
    });

    it('fails when end_time is not a valid ISO date string (isDateString)', async () => {
      const dto = buildValidDto({ end_time: 'not-a-date' });
      const errors = await validate(dto);
      // An invalid end_time also cascades to the isAfterEndTime validator on
      // resolution_time, so we expect ≥1 errors and check end_time specifically.
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const endTimeError = errors.find((e) => e.property === 'end_time');
      expect(endTimeError).toBeDefined();
      expect(endTimeError!.constraints).toHaveProperty('isDateString');
    });
  });

  // ── resolution_time ────────────────────────────────────────────────────
  describe('resolution_time', () => {
    it('fails when resolution_time is before end_time (isAfterEndTime)', async () => {
      const dto = buildValidDto({
        end_time: '2099-12-31T23:59:59.000Z',
        resolution_time: '2099-12-30T00:00:00.000Z',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('resolution_time');
      expect(errors[0].constraints).toHaveProperty('isAfterEndTime');
    });

    it('fails when resolution_time is not a valid ISO date string (isDateString)', async () => {
      const dto = buildValidDto({ resolution_time: 'not-a-date' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('resolution_time');
      expect(errors[0].constraints).toHaveProperty('isDateString');
    });
  });

  // ── creator_fee_bps ────────────────────────────────────────────────────
  describe('creator_fee_bps', () => {
    it('fails when creator_fee_bps is negative (min)', async () => {
      const dto = buildValidDto({ creator_fee_bps: -1 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('creator_fee_bps');
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('fails when creator_fee_bps exceeds 500 (max)', async () => {
      const dto = buildValidDto({ creator_fee_bps: 501 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('creator_fee_bps');
      expect(errors[0].constraints).toHaveProperty('max');
    });

    it('fails when creator_fee_bps is not a number (isNumber)', async () => {
      const dto = buildValidDto({ creator_fee_bps: 'abc' as any });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('creator_fee_bps');
      expect(errors[0].constraints).toHaveProperty('isNumber');
    });

    it('allows creator_fee_bps of 0 (boundary of min:0)', async () => {
      const dto = buildValidDto({ creator_fee_bps: 0 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('allows creator_fee_bps of 500 (boundary of max:500)', async () => {
      const dto = buildValidDto({ creator_fee_bps: 500 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ── min_stake_stroops ──────────────────────────────────────────────────
  describe('min_stake_stroops', () => {
    it('fails when min_stake_stroops is not a numeric string (isNumberString)', async () => {
      const dto = buildValidDto({ min_stake_stroops: 'not-a-number' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('min_stake_stroops');
      expect(errors[0].constraints).toHaveProperty('isNumberString');
    });

    it('fails when min_stake_stroops contains symbols (isNumberString)', async () => {
      const dto = buildValidDto({ min_stake_stroops: '10,000' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('min_stake_stroops');
      expect(errors[0].constraints).toHaveProperty('isNumberString');
    });

    it('allows min_stake_stroops of "0" (zero boundary)', async () => {
      const dto = buildValidDto({ min_stake_stroops: '0' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('allows a negative numeric string in min_stake_stroops (no min bound)', async () => {
      // IsNumberString accepts negative numbers as valid numeric strings
      const dto = buildValidDto({ min_stake_stroops: '-100' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ── max_stake_stroops ──────────────────────────────────────────────────
  describe('max_stake_stroops', () => {
    it('fails when max_stake_stroops is not a numeric string (isNumberString)', async () => {
      const dto = buildValidDto({ max_stake_stroops: 'not-a-number' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('max_stake_stroops');
      expect(errors[0].constraints).toHaveProperty('isNumberString');
    });

    it('fails when max_stake_stroops contains symbols (isNumberString)', async () => {
      const dto = buildValidDto({ max_stake_stroops: '1_000_000' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('max_stake_stroops');
      expect(errors[0].constraints).toHaveProperty('isNumberString');
    });

    it('allows max_stake_stroops of "0" (zero boundary)', async () => {
      const dto = buildValidDto({ max_stake_stroops: '0' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ── is_public ──────────────────────────────────────────────────────────
  describe('is_public', () => {
    it('fails when is_public is not a boolean (isBoolean)', async () => {
      const dto = buildValidDto({ is_public: 'true' as any });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('is_public');
      expect(errors[0].constraints).toHaveProperty('isBoolean');
    });
  });

  // ── Extra / unknown properties ─────────────────────────────────────────
  describe('unknown extra properties', () => {
    it('are silently ignored (no validation errors)', async () => {
      const dto = buildValidDto() as any;
      dto.unknown_field = 'should be ignored';
      dto.another_unknown = 42;
      const errors = await validate(dto);
      // class-validator only validates decorated properties,
      // so extra properties produce zero errors.
      expect(errors).toHaveLength(0);
    });
  });
});
