import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  EmailService,
  QueuedEmail,
  isNetworkError,
  isTransientError,
  computeBackoffDelay,
} from './email.service';
import { User } from '../users/entities/user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmail(overrides: Partial<QueuedEmail> = {}): QueuedEmail {
  return {
    id: 'test-msg-001',
    to: 'recipient@example.com',
    subject: 'Test Subject',
    html: '<p>Hello</p>',
    text: 'Hello',
    queuedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit tests for pure helpers (no fake timers needed)
// ---------------------------------------------------------------------------

describe('isNetworkError', () => {
  it('returns true for a TypeError (fetch network failure)', () => {
    expect(isNetworkError(new TypeError('fetch failed'))).toBe(true);
  });

  it('returns true when error cause has ECONNRESET code', () => {
    const err = new Error('request failed');
    (err as unknown as { cause: unknown }).cause = { code: 'ECONNRESET' };
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns true when error cause has ETIMEDOUT code', () => {
    const err = new Error('request failed');
    (err as unknown as { cause: unknown }).cause = { code: 'ETIMEDOUT' };
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns true for AbortError (request timeout via AbortController)', () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns false for a plain application Error', () => {
    expect(isNetworkError(new Error('something else'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isNetworkError('string error')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(42)).toBe(false);
  });
});

describe('isTransientError', () => {
  it('returns true for network errors', () => {
    expect(isTransientError(new TypeError('fetch failed'))).toBe(true);
  });

  it('returns true for HTTP 500', () => {
    expect(isTransientError(new Error('SendGrid error (500): Internal Server Error'))).toBe(true);
  });

  it('returns true for HTTP 503', () => {
    expect(isTransientError(new Error('SendGrid error (503): Service Unavailable'))).toBe(true);
  });

  it('returns true for HTTP 429 (rate limit)', () => {
    expect(isTransientError(new Error('SendGrid error (429): Too Many Requests'))).toBe(true);
  });

  it('returns false for HTTP 400 (bad request — permanent)', () => {
    expect(isTransientError(new Error('SendGrid error (400): Bad Request'))).toBe(false);
  });

  it('returns false for HTTP 401 (unauthorised — permanent)', () => {
    expect(isTransientError(new Error('SendGrid error (401): Unauthorized'))).toBe(false);
  });

  it('returns false for HTTP 422 (invalid recipient — permanent)', () => {
    expect(isTransientError(new Error('SendGrid error (422): Unprocessable Entity'))).toBe(false);
  });

  it('returns false for unrecognised error message shapes', () => {
    expect(isTransientError(new Error('Something unexpected happened'))).toBe(false);
  });
});

describe('computeBackoffDelay', () => {
  it('returns approximately baseDelay * 4^0 = baseDelay for attempt 0', () => {
    // Without jitter the exact value equals baseDelay; with ±20% jitter the
    // result is in [800, 1200] for base=1000.
    const delay = computeBackoffDelay(1000, 0);
    expect(delay).toBeGreaterThanOrEqual(800);
    expect(delay).toBeLessThanOrEqual(1200);
  });

  it('returns approximately 4000 ms for attempt 1 (base=1000)', () => {
    const delay = computeBackoffDelay(1000, 1);
    expect(delay).toBeGreaterThanOrEqual(3200);
    expect(delay).toBeLessThanOrEqual(4800);
  });

  it('returns approximately 16000 ms for attempt 2 (base=1000)', () => {
    const delay = computeBackoffDelay(1000, 2);
    expect(delay).toBeGreaterThanOrEqual(12800);
    expect(delay).toBeLessThanOrEqual(19200);
  });

  it('never returns a negative value', () => {
    for (let i = 0; i < 20; i++) {
      expect(computeBackoffDelay(0, 0)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// EmailService retry integration tests (fake timers)
// ---------------------------------------------------------------------------

describe('EmailService — deliverEmailWithRetry', () => {
  let service: EmailService;
  let userRepository: jest.Mocked<Pick<import('typeorm').Repository<User>, 'findOne'>>;
  let preferencesRepository: jest.Mocked<
    Pick<import('typeorm').Repository<UserPreferences>, 'findOne'>
  >;
  let configGetMock: jest.Mock;

  beforeEach(async () => {
    jest.useFakeTimers();

    userRepository = { findOne: jest.fn() };
    preferencesRepository = { findOne: jest.fn() };

    // Default config: 3 attempts, 1000 ms base delay
    configGetMock = jest.fn((key: string) => {
      if (key === 'EMAIL_RETRY_MAX_ATTEMPTS') return '3';
      if (key === 'EMAIL_RETRY_BASE_DELAY_MS') return '1000';
      if (key === 'SENDGRID_API_KEY') return 'test-api-key';
      if (key === 'EMAIL_FROM') return 'noreply@test.com';
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: { get: configGetMock },
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: preferencesRepository,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: Transient failure on attempt 1, success on attempt 2
  // -------------------------------------------------------------------------

  it('succeeds on attempt 2 after one transient failure, calling deliverEmail exactly once for the success', async () => {
    const transientError = new Error('SendGrid error (503): Service Unavailable');
    let callCount = 0;

    // Spy on the private deliverEmail method
    const deliverSpy = jest
      .spyOn(service as unknown as { deliverEmail: (e: QueuedEmail) => Promise<void> }, 'deliverEmail')
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw transientError;
        // second call succeeds (no-op)
      });

    const email = makeEmail();

    // Start the retry call but don't await yet — it will pause at the first
    // setTimeout (the backoff sleep after attempt 1).
    const retryPromise = service.deliverEmailWithRetry(email);

    // Fast-forward through the backoff delay for attempt 0 (≈ 1000 ms + jitter).
    // We advance by 2000 ms to comfortably cover the ±20 % jitter range.
    await jest.advanceTimersByTimeAsync(2000);

    // Now the promise should resolve (attempt 2 succeeded)
    await expect(retryPromise).resolves.toBeUndefined();

    // deliverEmail was called exactly twice: one failure, one success
    expect(deliverSpy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Test 2: Permanent failure — zero retries, provider called exactly once
  // -------------------------------------------------------------------------

  it('throws immediately on permanent failure without any retry', async () => {
    const permanentError = new Error('SendGrid error (422): invalid recipient address');

    const deliverSpy = jest
      .spyOn(service as unknown as { deliverEmail: (e: QueuedEmail) => Promise<void> }, 'deliverEmail')
      .mockRejectedValue(permanentError);

    const email = makeEmail();

    await expect(service.deliverEmailWithRetry(email)).rejects.toThrow(permanentError);

    // Provider was called exactly once — no retries
    expect(deliverSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 3: All 3 retries exhausted — final error surfaced, provider called 3×
  // -------------------------------------------------------------------------

  it('exhausts all 3 attempts on repeated transient failures and throws the final error', async () => {
    const transientError = new Error('SendGrid error (503): upstream timeout');

    const deliverSpy = jest
      .spyOn(service as unknown as { deliverEmail: (e: QueuedEmail) => Promise<void> }, 'deliverEmail')
      .mockRejectedValue(transientError);

    const email = makeEmail({ id: 'exhaust-test' });

    // Catch the rejection up-front so Jest doesn't treat it as unhandled
    let caughtError: unknown;
    const retryPromise = service.deliverEmailWithRetry(email).catch((e) => {
      caughtError = e;
    });

    // Advance through all backoff delays:
    //  attempt 0 → delay ≈ 1000 ms (4^0 * 1000)
    //  attempt 1 → delay ≈ 4000 ms (4^1 * 1000)
    // Advance by 6000 ms total to cover both gaps with jitter headroom.
    await jest.advanceTimersByTimeAsync(6000);
    await retryPromise;

    // Final error surfaced is the transient error from the last attempt
    expect(caughtError).toBe(transientError);

    // deliverEmail was called exactly 3 times
    expect(deliverSpy).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  // Test 4: Network error is treated as transient and retried
  // -------------------------------------------------------------------------

  it('retries on network TypeError and succeeds on the second attempt', async () => {
    const networkError = new TypeError('fetch failed');
    let callCount = 0;

    const deliverSpy = jest
      .spyOn(service as unknown as { deliverEmail: (e: QueuedEmail) => Promise<void> }, 'deliverEmail')
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw networkError;
      });

    const email = makeEmail({ id: 'network-retry-test' });
    const retryPromise = service.deliverEmailWithRetry(email);

    await jest.advanceTimersByTimeAsync(2000);

    await expect(retryPromise).resolves.toBeUndefined();
    expect(deliverSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Existing pre-retry tests (regression — must still pass)
// ---------------------------------------------------------------------------

describe('EmailService — queueing and preferences', () => {
  let service: EmailService;
  let userRepository: jest.Mocked<
    Pick<import('typeorm').Repository<User>, 'findOne'>
  >;
  let preferencesRepository: jest.Mocked<
    Pick<import('typeorm').Repository<UserPreferences>, 'findOne'>
  >;

  beforeEach(async () => {
    userRepository = { findOne: jest.fn() };
    preferencesRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => undefined),
          },
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: preferencesRepository,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('queues templated emails when preferences allow', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await service.sendTemplatedEmail(
      'user@example.com',
      'event_created',
      { eventTitle: 'World Cup', inviteCode: 'WC2026' },
    );

    expect(result.queued).toBe(true);
    expect(service.getQueueLength()).toBe(1);
  });

  it('respects email opt-out preferences', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' } as User);
    preferencesRepository.findOne.mockResolvedValue({
      email_notifications: false,
    } as UserPreferences);

    const result = await service.sendTemplatedEmail(
      'user@example.com',
      'match_result_available',
      { eventTitle: 'World Cup' },
      'GSTELLAR123',
    );

    expect(result.queued).toBe(false);
    expect(result.reason).toContain('opted out');
  });

  it('renders all template types without throwing', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const templates = [
      'event_created',
      'match_result_available',
      'event_won',
      'event_cancelled',
    ] as const;

    for (const template of templates) {
      const result = await service.sendTemplatedEmail(
        'user@example.com',
        template,
        { eventTitle: 'Test Event' },
      );
      expect(result.queued).toBe(true);
    }

    expect(service.getQueueLength()).toBe(4);
  });
});
