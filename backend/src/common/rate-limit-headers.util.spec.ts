import { setRateLimitHeaders } from './rate-limit-headers.util';

describe('setRateLimitHeaders', () => {
  it('sets all four standard headers when retryAfterSeconds is provided', () => {
    const setHeader = jest.fn();

    setRateLimitHeaders(
      { setHeader },
      { limit: 30, remaining: 0, resetSeconds: 12.4, retryAfterSeconds: 5.1 },
    );

    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '30');
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', '13'); // ceil(12.4)
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '6'); // ceil(5.1)
    expect(setHeader).toHaveBeenCalledTimes(4);
  });

  it('omits Retry-After when not provided (non-throttled responses)', () => {
    const setHeader = jest.fn();

    setRateLimitHeaders(
      { setHeader },
      { limit: 30, remaining: 25, resetSeconds: 12 },
    );

    expect(setHeader).toHaveBeenCalledTimes(3);
    expect(setHeader).not.toHaveBeenCalledWith(
      'Retry-After',
      expect.anything(),
    );
  });

  it('never reports negative remaining', () => {
    const setHeader = jest.fn();

    setRateLimitHeaders(
      { setHeader },
      { limit: 10, remaining: -5, resetSeconds: 1 },
    );

    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
  });
});
