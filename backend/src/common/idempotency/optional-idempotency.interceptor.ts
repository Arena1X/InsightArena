import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IDEMPOTENCY_HEADER = 'idempotency-key';
const IDEMPOTENCY_REPLAYED_HEADER = 'idempotency-replayed';

/**
 * Optional idempotency interceptor for POST endpoints.
 *
 * When the `Idempotency-Key` header is absent the request is processed
 * normally — existing clients are unaffected.
 *
 * When the header is present (must be a valid UUID):
 * - First use: process normally, persist {key, userId, response, statusCode}.
 * - Replay with same key + same body: return stored response with
 *   `Idempotency-Replayed: true` header.
 * - Replay with same key + different body: reject with 422.
 * - Keys are scoped per user — two users may use the same UUID independently.
 */
@Injectable()
export class OptionalIdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();

    const rawKey = request.headers[IDEMPOTENCY_HEADER];

    // No header → behave exactly as before (no idempotency semantics)
    if (!rawKey || typeof rawKey !== 'string') {
      return next.handle();
    }

    // Header present but not a valid UUID → reject
    if (!UUID_REGEX.test(rawKey)) {
      throw new UnprocessableEntityException(
        `${IDEMPOTENCY_HEADER} must be a valid UUID`,
      );
    }

    const userId = request.user?.id ?? 'anonymous';

    const requestHash = createHash('sha256')
      .update(
        `${request.method}:${request.originalUrl}:${JSON.stringify(request.body ?? {})}`,
      )
      .digest('hex');

    const result = await this.idempotencyService.acquire(
      rawKey,
      userId,
      requestHash,
    );

    if (!result.acquired) {
      const { record } = result;

      if (record.request_hash !== requestHash) {
        throw new UnprocessableEntityException(
          'Idempotency-Key was already used with a different request body',
        );
      }

      if (record.in_progress) {
        throw new ConflictException(
          'A request with this Idempotency-Key is already in progress',
        );
      }

      // Replay: return stored response with replay header
      const response = context.switchToHttp().getResponse<{
        statusCode: number;
        setHeader: (k: string, v: string) => void;
      }>();
      response.statusCode = record.status_code ?? 200;
      response.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');

      return of(record.response_body);
    }

    const { record } = result;
    return next.handle().pipe(
      tap((data) => {
        const response = context
          .switchToHttp()
          .getResponse<{ statusCode: number }>();
        void this.idempotencyService.complete(
          record.id,
          response.statusCode,
          data,
        );
      }),
      catchError((err) => {
        void this.idempotencyService.release(record.id);
        return throwError(() => err);
      }),
    );
  }
}
