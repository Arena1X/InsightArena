import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SearchQueryDto, escapeLikeWildcards } from './search-query.dto';

describe('SearchQueryDto', () => {
  async function validateDto(data: any): Promise<string[]> {
    const dto = plainToInstance(SearchQueryDto, data);
    const errors = await validate(dto);
    return errors.flatMap((e) => Object.values(e.constraints || {}));
  }

  describe('Valid queries', () => {
    it('accepts a 2-character query', async () => {
      const errors = await validateDto({ query: 'ab' });
      expect(errors).toHaveLength(0);
    });

    it('accepts a 100-character query', async () => {
      const query = 'a'.repeat(100);
      const errors = await validateDto({ query });
      expect(errors).toHaveLength(0);
    });

    it('accepts a normal multi-word query', async () => {
      const errors = await validateDto({ query: 'bitcoin price prediction' });
      expect(errors).toHaveLength(0);
    });

    it('trims leading and trailing whitespace', async () => {
      const dto = plainToInstance(SearchQueryDto, {
        query: '  bitcoin  ',
      });
      expect(dto.query).toBe('bitcoin');
    });

    it('normalizes internal whitespace (collapses multiple spaces)', async () => {
      const dto = plainToInstance(SearchQueryDto, {
        query: 'bitcoin    price   prediction',
      });
      expect(dto.query).toBe('bitcoin price prediction');
    });

    it('handles tabs and newlines as whitespace', async () => {
      const dto = plainToInstance(SearchQueryDto, {
        query: 'bitcoin\t\nprice',
      });
      expect(dto.query).toBe('bitcoin price');
    });
  });

  describe('Invalid queries - Too short', () => {
    it('rejects a 1-character query', async () => {
      const errors = await validateDto({ query: 'a' });
      expect(errors).toContain(
        'Search query must be at least 2 characters long',
      );
    });

    it('rejects an empty string', async () => {
      const errors = await validateDto({ query: '' });
      expect(errors).toContain(
        'Search query cannot be empty or whitespace-only',
      );
    });

    it('rejects a whitespace-only query (spaces)', async () => {
      const errors = await validateDto({ query: '   ' });
      expect(errors).toContain(
        'Search query cannot be empty or whitespace-only',
      );
    });

    it('rejects a whitespace-only query (tabs and newlines)', async () => {
      const errors = await validateDto({ query: '\t\n\r' });
      expect(errors).toContain(
        'Search query cannot be empty or whitespace-only',
      );
    });

    it('rejects a single character after trimming', async () => {
      const errors = await validateDto({ query: '  a  ' });
      expect(errors).toContain(
        'Search query must be at least 2 characters long',
      );
    });
  });

  describe('Invalid queries - Too long', () => {
    it('rejects a 101-character query', async () => {
      const query = 'a'.repeat(101);
      const errors = await validateDto({ query });
      expect(errors).toContain('Search query must not exceed 100 characters');
    });

    it('rejects a 200-character query', async () => {
      const query = 'a'.repeat(200);
      const errors = await validateDto({ query });
      expect(errors).toContain('Search query must not exceed 100 characters');
    });
  });

  describe('Invalid queries - Type validation', () => {
    it('rejects a non-string value (number)', async () => {
      const errors = await validateDto({ query: 123 });
      expect(errors).toContain('Search query must be a string');
    });

    it('rejects a non-string value (object)', async () => {
      const errors = await validateDto({ query: { test: 'value' } });
      expect(errors).toContain('Search query must be a string');
    });

    it('rejects a non-string value (array)', async () => {
      const errors = await validateDto({ query: ['bitcoin'] });
      expect(errors).toContain('Search query must be a string');
    });

    it('rejects null', async () => {
      const errors = await validateDto({ query: null });
      expect(errors).toContain('Search query must be a string');
    });

    it('rejects undefined', async () => {
      const errors = await validateDto({ query: undefined });
      expect(errors).toContain('Search query must be a string');
    });
  });
});

describe('escapeLikeWildcards', () => {
  it('escapes % wildcard', async () => {
    expect(escapeLikeWildcards('100%')).toBe('100\\%');
  });

  it('escapes _ wildcard', async () => {
    expect(escapeLikeWildcards('user_name')).toBe('user\\_name');
  });

  it('escapes multiple % wildcards', async () => {
    expect(escapeLikeWildcards('%%test%%')).toBe('\\%\\%test\\%\\%');
  });

  it('escapes multiple _ wildcards', async () => {
    expect(escapeLikeWildcards('__test__')).toBe('\\_\\_test\\_\\_');
  });

  it('escapes both % and _ wildcards', async () => {
    expect(escapeLikeWildcards('50%_discount')).toBe('50\\%\\_discount');
  });

  it('returns the original string if no wildcards present', async () => {
    expect(escapeLikeWildcards('bitcoin')).toBe('bitcoin');
  });

  it('handles empty string', async () => {
    expect(escapeLikeWildcards('')).toBe('');
  });

  it('handles null input', async () => {
    expect(escapeLikeWildcards(null as any)).toBe(null);
  });

  it('handles undefined input', async () => {
    expect(escapeLikeWildcards(undefined as any)).toBe(undefined);
  });

  it('escapes wildcard at the beginning', async () => {
    expect(escapeLikeWildcards('%bitcoin')).toBe('\\%bitcoin');
  });

  it('escapes wildcard at the end', async () => {
    expect(escapeLikeWildcards('bitcoin%')).toBe('bitcoin\\%');
  });

  it('escapes consecutive wildcards', async () => {
    expect(escapeLikeWildcards('test%_%pattern')).toBe('test\\%\\_\\%pattern');
  });
});
