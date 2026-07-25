import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { User } from '../users/entities/user.entity';
import {
  EmailTemplateContext,
  EmailTemplateType,
  renderEmailTemplate,
} from './email-templates';

export interface QueuedEmail {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  userAddress?: string;
  queuedAt: number;
}

const DEFAULT_RATE_LIMIT = 30;
const QUEUE_PROCESS_INTERVAL_MS = 2000;

/** Default maximum send attempts (1 initial + 2 retries = 3 total). */
const DEFAULT_RETRY_MAX_ATTEMPTS = 3;

/**
 * Default base delay in milliseconds for exponential backoff.
 * Delay formula: baseDelay * 4^attempt  →  1 s, 4 s, 16 s for attempts 0, 1, 2.
 */
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;

/**
 * Jitter factor: each computed delay is randomised by ±20 % to avoid
 * thundering-herd retries when multiple emails fail simultaneously.
 */
const JITTER_FACTOR = 0.2;

// ---------------------------------------------------------------------------
// Error-classification helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the error originates from a network-layer failure
 * (connection refused, DNS lookup failure, TCP reset, request abort/timeout).
 * These are always transient — the send can be retried.
 *
 * With Node's built-in `fetch` (>= 18), network errors surface as a
 * `TypeError` whose `.cause` may carry a `NodeJS.ErrnoException`.
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Fetch/network-level TypeErrors are transient (e.g. "fetch failed",
  // "terminated", "network socket disconnected").
  if (error instanceof TypeError) return true;

  // Errors with a cause that has a transient errno code.
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const code = (cause as { code?: unknown }).code;
    if (
      typeof code === 'string' &&
      ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
       'EPIPE', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(code)
    ) {
      return true;
    }
  }

  // Abort / timeout signals (AbortError name set by fetch AbortController).
  if (error.name === 'AbortError') return true;

  return false;
}

/**
 * Returns true when the HTTP response status code is transient.
 * 5xx responses from SendGrid (server errors, rate-limit 429 treated as
 * transient) should be retried.  4xx responses (invalid recipient 550-style
 * errors reflected as HTTP 4xx) are permanent and must not be retried.
 *
 * SendGrid wraps errors as: `"SendGrid error (STATUS): body"`
 */
export function isTransientHttpStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Classifies a thrown error as transient (eligible for retry) or permanent.
 *
 * Transient:
 *  - Network-level failures (TypeError, errno codes, AbortError)
 *  - HTTP 5xx and HTTP 429 (rate-limit / server unavailable)
 *
 * Permanent:
 *  - HTTP 4xx (except 429): invalid address, auth failure, bad request, etc.
 *  - Any other non-network, non-HTTP error (unexpected shape)
 */
export function isTransientError(error: unknown): boolean {
  if (isNetworkError(error)) return true;

  if (error instanceof Error) {
    // Parse the status code embedded by deliverEmail: "SendGrid error (STATUS): ..."
    const match = /SendGrid error \((\d{3})\)/.exec(error.message);
    if (match) {
      const status = parseInt(match[1], 10);
      return isTransientHttpStatus(status);
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Backoff delay helper
// ---------------------------------------------------------------------------

/**
 * Computes the delay before attempt `attemptIndex` (0-based).
 *
 * Formula: baseDelayMs * 4^attemptIndex  →  1 s, 4 s, 16 s
 * Jitter:  ±JITTER_FACTOR of the computed delay (uniform distribution)
 */
export function computeBackoffDelay(
  baseDelayMs: number,
  attemptIndex: number,
): number {
  const exponential = baseDelayMs * Math.pow(4, attemptIndex);
  const jitter = exponential * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private readonly queue: QueuedEmail[] = [];
  private readonly sentTimestamps: number[] = [];
  private processTimer: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserPreferences)
    private readonly preferencesRepository: Repository<UserPreferences>,
  ) {}

  onModuleInit(): void {
    this.processTimer = setInterval(() => {
      void this.processQueue();
    }, QUEUE_PROCESS_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.processTimer) {
      clearInterval(this.processTimer);
    }
  }

  async sendTemplatedEmail(
    to: string,
    template: EmailTemplateType,
    context: EmailTemplateContext,
    userAddress?: string,
  ): Promise<{ queued: boolean; reason?: string }> {
    if (userAddress) {
      const allowed = await this.isEmailAllowed(userAddress, template);
      if (!allowed) {
        return {
          queued: false,
          reason: 'User has opted out of email notifications',
        };
      }
    }

    const { subject, html, text } = renderEmailTemplate(template, context);

    return this.queueEmail({ to, subject, html, text, userAddress });
  }

  async queueEmail(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
    userAddress?: string;
  }): Promise<{ queued: boolean; reason?: string }> {
    if (!params.to?.trim()) {
      return { queued: false, reason: 'Recipient email is required' };
    }

    if (params.userAddress) {
      const allowed = await this.isEmailAllowed(params.userAddress);
      if (!allowed) {
        return {
          queued: false,
          reason: 'User has opted out of email notifications',
        };
      }
    }

    this.queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      to: params.to.trim(),
      subject: params.subject,
      html: params.html,
      text: params.text,
      userAddress: params.userAddress,
      queuedAt: Date.now(),
    });

    return { queued: true };
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  private async isEmailAllowed(
    userAddress: string,
    template?: EmailTemplateType,
  ): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { stellar_address: userAddress },
    });

    if (!user) {
      return true;
    }

    const prefs = await this.preferencesRepository.findOne({
      where: { userId: user.id },
    });

    if (!prefs) {
      return true;
    }

    if (!prefs.email_notifications) {
      return false;
    }

    if (template === 'event_cancelled' || template === 'event_created') {
      return prefs.competition_notifications;
    }

    if (template === 'match_result_available') {
      return prefs.market_resolution_notifications;
    }

    if (template === 'event_won') {
      return prefs.leaderboard_notifications;
    }

    return true;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    if (!this.canSendMore()) {
      return;
    }

    this.isProcessing = true;

    try {
      const email = this.queue.shift();
      if (!email) {
        return;
      }

      await this.deliverEmailWithRetry(email);
      this.sentTimestamps.push(Date.now());
    } catch (error) {
      this.logger.error(
        `Failed to process email queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private canSendMore(): boolean {
    const limit = Number(
      this.configService.get<string>('EMAIL_RATE_LIMIT_PER_MINUTE') ??
        DEFAULT_RATE_LIMIT,
    );
    const cutoff = Date.now() - 60_000;
    const recent = this.sentTimestamps.filter((t) => t >= cutoff);
    this.sentTimestamps.splice(0, this.sentTimestamps.length, ...recent);
    return recent.length < limit;
  }

  /**
   * Wraps `deliverEmail` with an exponential-backoff retry policy.
   *
   * - Max attempts: EMAIL_RETRY_MAX_ATTEMPTS (default 3)
   * - Delay formula: EMAIL_RETRY_BASE_DELAY_MS * 4^attemptIndex  →  1 s, 4 s, 16 s
   * - Jitter: ±20 % of the computed delay
   * - Only transient errors (network failures, HTTP 5xx/429) are retried.
   * - Permanent errors (HTTP 4xx) throw immediately without retry.
   */
  async deliverEmailWithRetry(email: QueuedEmail): Promise<void> {
    const maxAttempts = Number(
      this.configService.get<string>('EMAIL_RETRY_MAX_ATTEMPTS') ??
        DEFAULT_RETRY_MAX_ATTEMPTS,
    );
    const baseDelayMs = Number(
      this.configService.get<string>('EMAIL_RETRY_BASE_DELAY_MS') ??
        DEFAULT_RETRY_BASE_DELAY_MS,
    );

    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.deliverEmail(email);
        return; // success
      } catch (error) {
        lastError = error;

        if (!isTransientError(error)) {
          // Permanent failure — do not retry
          this.logger.error(
            `Permanent email failure for message ${email.id} (attempt ${attempt + 1}/${maxAttempts}): ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }

        const attemptsRemaining = maxAttempts - attempt - 1;

        if (attemptsRemaining === 0) {
          break; // exhausted — log final error below
        }

        const delayMs = computeBackoffDelay(baseDelayMs, attempt);
        this.logger.warn(
          `Transient email failure for message ${email.id} — attempt ${attempt + 1}/${maxAttempts}, ` +
            `retrying in ${delayMs} ms: ${error instanceof Error ? error.message : String(error)}`,
        );

        await this.sleep(delayMs);
      }
    }

    // All attempts exhausted
    this.logger.error(
      `Email delivery failed after ${maxAttempts} attempt(s) for message ${email.id} — ` +
        `final error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
    throw lastError;
  }

  private async deliverEmail(email: QueuedEmail): Promise<void> {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    const fromEmail =
      this.configService.get<string>('EMAIL_FROM') ??
      'notifications@insightarena.app';

    if (apiKey) {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: email.to }] }],
          from: { email: fromEmail, name: 'InsightArena' },
          subject: email.subject,
          content: [
            { type: 'text/plain', value: email.text },
            { type: 'text/html', value: email.html },
          ],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`SendGrid error (${response.status}): ${body}`);
      }

      this.logger.log(`Email sent to ${email.to}: ${email.subject}`);
      return;
    }

    this.logger.log(
      `[DEV] Email queued for ${email.to}: ${email.subject}\n${email.text}`,
    );
  }

  /** Thin wrapper around `setTimeout` so tests can mock it via fake timers. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
