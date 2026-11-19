import {
  computeBackoffDelay,
  withRetry,
  withTimeout,
  TimeoutError,
  RetryOptions,
} from './retry.util';

describe('retry.util', () => {
  describe('computeBackoffDelay', () => {
    it('should compute exponential backoff with jitter', () => {
      const baseDelay = 1000;

      // Attempt 0: 1000 * 4^0 = 1000
      const delay0 = computeBackoffDelay(baseDelay, 0);
      expect(delay0).toBeGreaterThanOrEqual(800); // 1000 - 20%
      expect(delay0).toBeLessThanOrEqual(1200); // 1000 + 20%

      // Attempt 1: 1000 * 4^1 = 4000
      const delay1 = computeBackoffDelay(baseDelay, 1);
      expect(delay1).toBeGreaterThanOrEqual(3200); // 4000 - 20%
      expect(delay1).toBeLessThanOrEqual(4800); // 4000 + 20%

      // Attempt 2: 1000 * 4^2 = 16000
      const delay2 = computeBackoffDelay(baseDelay, 2);
      expect(delay2).toBeGreaterThanOrEqual(12800); // 16000 - 20%
      expect(delay2).toBeLessThanOrEqual(19200); // 16000 + 20%
    });

    it('should increase exponentially with each attempt', () => {
      const baseDelay = 100;
      const delay0 = computeBackoffDelay(baseDelay, 0);
      const delay1 = computeBackoffDelay(baseDelay, 1);
      const delay2 = computeBackoffDelay(baseDelay, 2);

      // Each delay should be roughly 4x the previous
      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('should never return negative values', () => {
      const baseDelay = 1;
      for (let i = 0; i < 10; i++) {
        const delay = computeBackoffDelay(baseDelay, i);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle large attempt numbers', () => {
      const baseDelay = 1000;
      const delay = computeBackoffDelay(baseDelay, 10);
      expect(delay).toBeGreaterThan(0);
      expect(Number.isFinite(delay)).toBe(true);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const isTransient = jest.fn().mockReturnValue(true);

      const result = await withRetry(fn, {
        maxAttempts: 3,
        isTransient,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(isTransient).not.toHaveBeenCalled();
    });

    it('should retry on transient errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce('success');

      const isTransient = jest.fn().mockReturnValue(true);
      const onRetry = jest.fn();

      const result = await withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 1,
        isTransient,
        onRetry,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(isTransient).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('should throw on non-transient errors without retrying', async () => {
      const error = new Error('permanent');
      const fn = jest.fn().mockRejectedValueOnce(error);
      const isTransient = jest.fn().mockReturnValue(false);

      await expect(
        withRetry(fn, {
          maxAttempts: 5,
          isTransient,
        }),
      ).rejects.toThrow('permanent');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(isTransient).toHaveBeenCalledTimes(1);
    });

    it('should throw after exhausting max attempts', async () => {
      const error = new Error('transient');
      const fn = jest.fn().mockRejectedValue(error);
      const isTransient = jest.fn().mockReturnValue(true);

      await expect(
        withRetry(fn, {
          maxAttempts: 3,
          baseDelayMs: 1,
          isTransient,
        }),
      ).rejects.toThrow('transient');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use default max attempts of 3', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('transient'));
      const isTransient = jest.fn().mockReturnValue(true);

      await expect(
        withRetry(fn, {
          isTransient,
          baseDelayMs: 1,
        }),
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use default base delay of 1000ms', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          throw new Error('transient');
        }
        return Promise.resolve('success');
      });

      const isTransient = jest.fn().mockReturnValue(true);
      const onRetry = jest.fn();

      const result = await withRetry(fn, {
        isTransient,
        onRetry,
      });

      expect(result).toBe('success');
      // The delay should be roughly 1000ms with 20% jitter
      const callDelay = onRetry.mock.calls[0][2];
      expect(callDelay).toBeGreaterThanOrEqual(800);
      expect(callDelay).toBeLessThanOrEqual(1200);
    });

    it('should call onRetry callback with error, attempt, and delay', async () => {
      const error = new Error('transient');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const isTransient = jest.fn().mockReturnValue(true);
      const onRetry = jest.fn();

      await withRetry(fn, {
        maxAttempts: 2,
        baseDelayMs: 10,
        isTransient,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledWith(error, 0, expect.any(Number));
    });
  });

  describe('TimeoutError', () => {
    it('should create error with AbortError name', () => {
      const error = new TimeoutError('test timeout');
      expect(error.name).toBe('AbortError');
      expect(error.message).toContain('test timeout');
    });

    it('should be instanceof Error', () => {
      const error = new TimeoutError('test');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve successfully if function completes before timeout', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const resultPromise = withTimeout(fn, 5000, 'test');
      jest.advanceTimersByTime(1000);
      const result = await resultPromise;

      expect(result).toBe('success');
    });

    it('should throw TimeoutError if function exceeds timeout', async () => {
      const fn = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('success'), 10000);
          }),
      );

      const resultPromise = withTimeout(fn, 5000, 'test operation');
      jest.advanceTimersByTime(5000);

      await expect(resultPromise).rejects.toThrow(TimeoutError);
      await expect(resultPromise).rejects.toThrow(
        'test operation timed out after 5000ms',
      );
    });

    it('should have AbortError name for timeout errors', async () => {
      const fn = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('success'), 10000);
          }),
      );

      try {
        const resultPromise = withTimeout(fn, 5000, 'test');
        jest.advanceTimersByTime(5000);
        await resultPromise;
      } catch (error) {
        expect((error as TimeoutError).name).toBe('AbortError');
      }
    });

    it('should swallow rejection from pending function', async () => {
      const fn = jest.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('pending rejection')), 10000);
          }),
      );

      const resultPromise = withTimeout(fn, 5000, 'test');
      jest.advanceTimersByTime(5000);

      await expect(resultPromise).rejects.toThrow(TimeoutError);
      // Wait for pending to settle and ensure no unhandled rejection
      jest.advanceTimersByTime(10000);
      await new Promise((resolve) => setImmediate(resolve));
    });

    it('should clear timeout after successful resolution', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const fn = jest.fn().mockResolvedValue('success');

      const resultPromise = withTimeout(fn, 5000, 'test');
      jest.advanceTimersByTime(1000);
      await resultPromise;

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('should handle zero timeout', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const resultPromise = withTimeout(fn, 0, 'immediate');
      jest.advanceTimersByTime(0);

      await expect(resultPromise).rejects.toThrow(TimeoutError);
    });
  });
});
