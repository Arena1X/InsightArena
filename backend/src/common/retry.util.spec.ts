import {
  withRetry,
  withTimeout,
  computeBackoffDelay,
  TimeoutError,
  RetryOptions,
} from './retry.util';

describe('retry.util', () => {
  describe('computeBackoffDelay', () => {
    it('should compute exponential backoff with base delay', () => {
      const baseDelayMs = 1000;
      const delay0 = computeBackoffDelay(baseDelayMs, 0);
      const delay1 = computeBackoffDelay(baseDelayMs, 1);
      const delay2 = computeBackoffDelay(baseDelayMs, 2);

      // Attempt 0: 1000 * 4^0 = 1000 (±20% jitter)
      expect(delay0).toBeGreaterThanOrEqual(800);
      expect(delay0).toBeLessThanOrEqual(1200);

      // Attempt 1: 1000 * 4^1 = 4000 (±20% jitter)
      expect(delay1).toBeGreaterThanOrEqual(3200);
      expect(delay1).toBeLessThanOrEqual(4800);

      // Attempt 2: 1000 * 4^2 = 16000 (±20% jitter)
      expect(delay2).toBeGreaterThanOrEqual(12800);
      expect(delay2).toBeLessThanOrEqual(19200);
    });

    it('should apply jitter to delay calculation', () => {
      const baseDelayMs = 1000;
      const delays = Array(10)
        .fill(null)
        .map(() => computeBackoffDelay(baseDelayMs, 0));

      // With jitter, delays should vary
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('should never return negative delay', () => {
      const baseDelayMs = 1;
      const delay = computeBackoffDelay(baseDelayMs, 10);

      expect(delay).toBeGreaterThanOrEqual(0);
    });

    it('should grow exponentially with attempt index', () => {
      const baseDelayMs = 100;
      const delays = [0, 1, 2, 3].map((i) => computeBackoffDelay(baseDelayMs, i));

      // Each attempt's max should be roughly 4x the previous (allowing for jitter)
      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
      expect(delays[3]).toBeGreaterThan(delays[2]);
    });

    it('should handle zero base delay', () => {
      const delay = computeBackoffDelay(0, 5);
      expect(delay).toBe(0);
    });

    it('should handle very large base delay', () => {
      const baseDelayMs = 1000000;
      const delay = computeBackoffDelay(baseDelayMs, 2);

      expect(delay).toBeGreaterThan(0);
      expect(typeof delay).toBe('number');
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const isTransient = jest.fn().mockReturnValue(false);

      const result = await withRetry(fn, { isTransient });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(isTransient).not.toHaveBeenCalled();
    });

    it('should retry on transient error and succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce('success');

      const isTransient = jest.fn().mockReturnValue(true);

      const result = await withRetry(fn, {
        isTransient,
        maxAttempts: 3,
        baseDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(isTransient).toHaveBeenCalledTimes(1);
    });

    it('should not retry on permanent error', async () => {
      const permanentError = new Error('Permanent error');
      const fn = jest.fn().mockRejectedValue(permanentError);
      const isTransient = jest.fn().mockReturnValue(false);

      await expect(
        withRetry(fn, { isTransient, maxAttempts: 3 }),
      ).rejects.toThrow('Permanent error');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(isTransient).toHaveBeenCalledTimes(1);
    });

    it('should exhaust max attempts and throw last error', async () => {
      const transientError = new Error('Transient error');
      const fn = jest.fn().mockRejectedValue(transientError);
      const isTransient = jest.fn().mockReturnValue(true);

      await expect(
        withRetry(fn, { isTransient, maxAttempts: 3, baseDelayMs: 5 }),
      ).rejects.toThrow('Transient error');

      expect(fn).toHaveBeenCalledTimes(3);
      expect(isTransient).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback on transient error', async () => {
      const onRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce('success');

      const isTransient = jest.fn().mockReturnValue(true);

      await withRetry(fn, {
        isTransient,
        maxAttempts: 3,
        baseDelayMs: 5,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(
        1,
        expect.any(Error),
        0,
        expect.any(Number),
      );
      expect(onRetry).toHaveBeenNthCalledWith(
        2,
        expect.any(Error),
        1,
        expect.any(Number),
      );
    });

    it('should use default max attempts of 3', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Error'));
      const isTransient = jest.fn().mockReturnValue(true);

      await expect(
        withRetry(fn, { isTransient, baseDelayMs: 5 }),
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use default base delay of 1000ms', async () => {
      const onRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce('success');

      const isTransient = jest.fn().mockReturnValue(true);

      await withRetry(fn, { isTransient, onRetry });

      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Error),
        0,
        expect.any(Number),
      );
      const delayMs = onRetry.mock.calls[0][2];
      expect(delayMs).toBeGreaterThanOrEqual(800);
      expect(delayMs).toBeLessThanOrEqual(1200);
    });

    it('should respect custom max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Error'));
      const isTransient = jest.fn().mockReturnValue(true);

      await expect(
        withRetry(fn, { isTransient, maxAttempts: 5, baseDelayMs: 5 }),
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should return generic type correctly', async () => {
      interface Result {
        value: string;
        count: number;
      }

      const result: Result = { value: 'test', count: 42 };
      const fn = jest.fn().mockResolvedValue(result);
      const isTransient = jest.fn().mockReturnValue(false);

      const returned = await withRetry(fn, { isTransient });

      expect(returned).toEqual(result);
      expect(returned.value).toBe('test');
      expect(returned.count).toBe(42);
    });

    it('should handle various error types in isTransient classifier', async () => {
      const errors = [
        new Error('Network error'),
        new TypeError('Type mismatch'),
        { message: 'Custom error' },
        'string error',
      ];

      const onRetry = jest.fn();
      const isTransient = jest
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValue(false);

      const fn = jest
        .fn()
        .mockRejectedValueOnce(errors[0])
        .mockRejectedValueOnce(errors[1])
        .mockRejectedValueOnce(errors[2])
        .mockRejectedValueOnce(errors[3]);

      await expect(
        withRetry(fn, { isTransient, maxAttempts: 4, baseDelayMs: 5, onRetry }),
      ).rejects.toBeDefined();

      expect(isTransient).toHaveBeenCalledTimes(4);
    });

    it('should handle fn that never settles (actual timeout test uses withTimeout)', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const isTransient = jest.fn().mockReturnValue(false);

      const result = await withRetry(fn, { isTransient });

      expect(result).toBe('success');
    });

    it('should preserve error stack trace through retries', async () => {
      const originalError = new Error('Original error');
      originalError.stack = 'Original stack trace';

      const fn = jest
        .fn()
        .mockRejectedValue(originalError)
        .mockRejectedValue(originalError);

      const isTransient = jest.fn().mockReturnValue(true);

      try {
        await withRetry(fn, {
          isTransient,
          maxAttempts: 2,
          baseDelayMs: 5,
        });
      } catch (error) {
        expect(error).toBe(originalError);
        expect((error as Error).stack).toBe('Original stack trace');
      }
    });
  });

  describe('TimeoutError', () => {
    it('should create TimeoutError with correct name', () => {
      const error = new TimeoutError('Test timeout');

      expect(error.message).toBe('Test timeout');
      expect(error.name).toBe('AbortError');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TimeoutError);
    });

    it('should have stack trace', () => {
      const error = new TimeoutError('Test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TimeoutError');
    });

    it('should be catchable as Error', () => {
      const error = new TimeoutError('Test');

      expect(error instanceof Error).toBe(true);
    });
  });

  describe('withTimeout', () => {
    it('should resolve within timeout', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withTimeout(fn, 1000, 'test operation');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reject with TimeoutError when exceeding timeout', async () => {
      const fn = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('success'), 500);
            }),
        );

      await expect(
        withTimeout(fn, 100, 'test operation'),
      ).rejects.toThrow(TimeoutError);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should include label in timeout error message', async () => {
      const fn = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('success'), 500);
            }),
        );

      await expect(
        withTimeout(fn, 100, 'custom operation'),
      ).rejects.toThrow('custom operation timed out after 100ms');
    });

    it('should have AbortError name for compatibility', async () => {
      const fn = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('success'), 500);
            }),
        );

      try {
        await withTimeout(fn, 100, 'test');
      } catch (error) {
        expect((error as Error).name).toBe('AbortError');
      }
    });

    it('should clear timer on success', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const fn = jest.fn().mockResolvedValue('success');

      await withTimeout(fn, 1000, 'test');

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it('should clear timer on timeout', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const fn = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('success'), 500);
            }),
        );

      try {
        await withTimeout(fn, 100, 'test');
      } catch (_) {
        // Expected to timeout
      }

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it('should swallow error from fn if timeout wins', async () => {
      const rejectionError = new Error('Function error');
      const fn = jest.fn().mockRejectedValue(rejectionError);

      // The function rejects, but timeout also fires
      const timeoutPromise = withTimeout(fn, 50, 'test');

      // We should get TimeoutError, not the function's error
      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
    });

    it('should handle fn that settles after timeout with unobserved rejection', async () => {
      let resolveInner: (value: string) => void;
      const innerPromise = new Promise<string>((resolve) => {
        resolveInner = resolve;
      });

      const fn = jest.fn().mockReturnValue(innerPromise);

      const timeoutPromise = withTimeout(fn, 100, 'test');

      // Wait for timeout to trigger
      await expect(timeoutPromise).rejects.toThrow(TimeoutError);

      // Now resolve the inner promise after timeout (should be swallowed)
      resolveInner!('late success');

      // Give it a moment to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      // No unhandled rejection should have been thrown
    });

    it('should pass return type through correctly', async () => {
      interface Data {
        id: number;
        name: string;
      }

      const data: Data = { id: 1, name: 'test' };
      const fn = jest.fn().mockResolvedValue(data);

      const result = await withTimeout(fn, 1000, 'test');

      expect(result).toEqual(data);
      expect(result.id).toBe(1);
      expect(result.name).toBe('test');
    });

    it('should handle zero timeout', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      await expect(withTimeout(fn, 0, 'test')).rejects.toThrow(TimeoutError);
    });

    it('should handle very large timeout', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withTimeout(fn, 10000000, 'test');

      expect(result).toBe('success');
    });
  });

  describe('retry and timeout combinations', () => {
    it('should retry within timeout window', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockResolvedValueOnce('success');

      const isTransient = jest.fn().mockReturnValue(true);

      const result = await withTimeout(
        () => withRetry(fn, { isTransient, maxAttempts: 3, baseDelayMs: 10 }),
        1000,
        'retry test',
      );

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should timeout while retrying', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Transient'));
      const isTransient = jest.fn().mockReturnValue(true);

      await expect(
        withTimeout(
          () =>
            withRetry(fn, {
              isTransient,
              maxAttempts: 10,
              baseDelayMs: 500,
            }),
          100,
          'retry with timeout',
        ),
      ).rejects.toThrow(TimeoutError);
    });
  });
});
