import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  PaginationQueryDto,
  buildPaginationMeta,
} from './pagination-query.dto';

// ---------------------------------------------------------------------------
// Helper: transform plain object to instance and validate
// ---------------------------------------------------------------------------
async function validateDto(
  plain: Record<string, unknown>,
): Promise<{ errors: string[]; instance: PaginationQueryDto }> {
  const instance = plainToInstance(PaginationQueryDto, plain);
  const errs = await validate(instance);
  const errors = errs.flatMap((e) => Object.values(e.constraints ?? {}));
  return { errors, instance };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaginationQueryDto', () => {
  // -------------------------------------------------------------------------
  // Defaults (missing params)
  // -------------------------------------------------------------------------
  describe('defaults', () => {
    it('applies default page=1 and limit=20 when no params are provided', async () => {
      const { errors, instance } = await validateDto({});
      expect(errors).toHaveLength(0);
      expect(instance.page).toBe(1);
      expect(instance.limit).toBe(20);
    });
  });

  // -------------------------------------------------------------------------
  // Valid inputs
  // -------------------------------------------------------------------------
  describe('valid inputs', () => {
    it('accepts page=1, limit=1', async () => {
      const { errors } = await validateDto({ page: 1, limit: 1 });
      expect(errors).toHaveLength(0);
    });

    it('accepts page=5, limit=100 (max limit)', async () => {
      const { errors } = await validateDto({ page: 5, limit: 100 });
      expect(errors).toHaveLength(0);
    });

    it('coerces numeric strings to numbers', async () => {
      const { errors, instance } = await validateDto({
        page: '3',
        limit: '50',
      });
      expect(errors).toHaveLength(0);
      expect(instance.page).toBe(3);
      expect(instance.limit).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid: limit=0
  // -------------------------------------------------------------------------
  describe('limit=0', () => {
    it('rejects limit=0 with 400-caliber validation error', async () => {
      const { errors } = await validateDto({ limit: 0 });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join(' ')).toMatch(/limit/i);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid: limit=101 (exceeds max)
  // -------------------------------------------------------------------------
  describe('limit=101', () => {
    it('rejects limit=101 with a descriptive message', async () => {
      const { errors } = await validateDto({ limit: 101 });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join(' ')).toMatch(/100/);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid: limit=abc (non-numeric)
  // -------------------------------------------------------------------------
  describe('limit="abc"', () => {
    it('rejects non-numeric limit with a validation error', async () => {
      const { errors } = await validateDto({ limit: 'abc' });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid: negative page
  // -------------------------------------------------------------------------
  describe('negative page', () => {
    it('rejects page=-1 with a descriptive message', async () => {
      const { errors } = await validateDto({ page: -1 });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join(' ')).toMatch(/page/i);
    });

    it('rejects page=0 with a descriptive message', async () => {
      const { errors } = await validateDto({ page: 0 });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Boundary values
  // -------------------------------------------------------------------------
  describe('boundary values', () => {
    it('accepts page=1 (min boundary)', async () => {
      const { errors } = await validateDto({ page: 1 });
      expect(errors).toHaveLength(0);
    });

    it('accepts limit=1 (min boundary)', async () => {
      const { errors } = await validateDto({ limit: 1 });
      expect(errors).toHaveLength(0);
    });

    it('accepts limit=100 (max boundary)', async () => {
      const { errors } = await validateDto({ limit: 100 });
      expect(errors).toHaveLength(0);
    });

    it('rejects limit=101 (one over max)', async () => {
      const { errors } = await validateDto({ limit: 101 });
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// buildPaginationMeta
// ---------------------------------------------------------------------------

describe('buildPaginationMeta', () => {
  it('computes totalPages correctly', () => {
    expect(buildPaginationMeta(100, 1, 20).totalPages).toBe(5);
    expect(buildPaginationMeta(101, 1, 20).totalPages).toBe(6);
    expect(buildPaginationMeta(20, 1, 20).totalPages).toBe(1);
    expect(buildPaginationMeta(0, 1, 20).totalPages).toBe(0);
    expect(buildPaginationMeta(1, 1, 100).totalPages).toBe(1);
  });

  it('passes through page and limit unchanged', () => {
    const meta = buildPaginationMeta(200, 3, 50);
    expect(meta.page).toBe(3);
    expect(meta.limit).toBe(50);
    expect(meta.total).toBe(200);
  });
});
