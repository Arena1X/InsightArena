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
import { IdempotencyService } from '../idempotency/idempotency.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const IDEMPOTENCY_REPLAYED_HEADER = 'idempotency-replayed';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Global idempotency interceptor for mutating endpoints (POST/PUT/PATCH/DELETE).
 *
 * GET and other read-only requests are always passed through untouched.
 *
 * When the `Idempotency-Key` header is absent the request is processed
 * normally — existing clients are unaffected (optional, not mandatory).
 *
 * When the header is present:
 * - Keys are scoped per (user, route-pattern, idempotency-key) — two users
 *   sharing the same key value do not collide, and the same user using the
 *   same key on two different routes (e.g. POST /predictions vs POST /markets)
 *   are stored independently.  The route pattern (e.g. /predictions/:id) is
 *   derived from req.route.path so that /predictions/1 and /predictions/2 map
 *   to the same logical route and cannot accidentally cross-collide.
 * - First use: process normally, persist {key, userId, response, statusCode}.
 * - Replay with same (user, route, key) + same body: return stored response
 *   with `Idempotency-Replayed: true` header, without re-executing the handler.
 * - Replay with same (user, route, key) + different body: reject with 422.
 * - Concurrent request with same (user, route, key): reject with 409.
 *
 * Race / concurrency note: the unique index on (key, userId) in the DB catches
 * the concurrent-insert case.  The stored key value includes the route prefix
 * (see `buildStoredKey`), so the uniqueness window is effectively
 * (userId, route:clientKey).  A second concurrent request will hit the
 * unique-violation path, see `in_progress: true`, and receive a 409 —
 * consistent with the error-handling convention used in IdempotencyService.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { user?: { id: string }; route?: { path: string } }
    >();

    // Only apply idempotency semantics to mutating methods
    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    const rawKey = request.headers[IDEMPOTENCY_HEADER];

    // No header → pass through normally (optional, not mandatory)
    if (!rawKey || typeof rawKey !== 'string') {
      return next.handle();
    }

    const userId = request.user?.id ?? 'anonymous';

    // Derive the matched route pattern to avoid collisions between different
    // routes that share the same client key value, and to avoid false collisions
    // between requests to the same logical route but different resource IDs
    // (e.g. PATCH /users/1 and PATCH /users/2 both match /users/:id).
    //
    // Express populates req.route.path with the matched pattern after routing.
    // At global-interceptor time the route is already matched, so this is safe.
    // Fall back to originalUrl only if req.route is somehow unavailable (e.g.
    // in unit tests where Express routing hasn't run).
    const routePattern: string =
      request.route?.path ?? request.originalUrl ?? '';

    // Fold the route pattern into the stored key so the DB unique constraint on
    // (key, userId) effectively enforces uniqueness across (userId, route, clientKey)
    // without requiring a schema change.
    const storedKey = this.buildStoredKey(
      request.method,
      routePattern,
      rawKey,
    );

    // sha256 of method+originalUrl+body — detects same-key/different-body reuse.
    // Use originalUrl (with actual IDs) for the hash so two requests to
    // different resources of the same route type don't hash-collide.
    const requestHash = createHash('sha256')
      .update(
        `${request.method}:${request.originalUrl}:${JSON.stringify(request.body ?? {})}`,
      )
      .digest('hex');

    const result = await this.idempotencyService.acquire(
      storedKey,
      userId,
      requestHash,
    );

    if (!result.acquired) {
      const { record } = result;

      if (record.request_hash !== requestHash) {
        throw new UnprocessableEntityException(
          'Idempotency-Key was already used with a different request body or URL',
        );
      }

      if (record.in_progress) {
        throw new ConflictException(
          'A request with this Idempotency-Key is already in progress',
        );
      }

      // Replay: return the stored response and signal the client via header
      const response = http.getResponse<{
        statusCode: number;
        setHeader: (k: string, v: string) => void;
      }>();
      if (record.status_code !== null) {
        response.statusCode = record.status_code;
      }
      response.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');

      return of(record.response_body);
    }

    const { record } = result;
    return next.handle().pipe(
      tap((data) => {
        const response = http.getResponse<{ statusCode: number }>();
        void this.idempotencyService.complete(
          record.id,
          response.statusCode,
          data,
        );
      }),
      catchError((err: unknown) => {
        // Handler failed — release the key so the client can safely retry
        void this.idempotencyService.release(record.id);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Builds the value stored in the `key` column of idempotency_keys.
   *
   * By prefixing with "METHOD:routePattern:" we get per-route scoping from
   * the existing (key, userId) unique index without adding a new column.
   * The client-supplied key is appended verbatim after the prefix.
   *
   * Example:
   *   method="POST", routePattern="/predictions", clientKey="uuid-123"
   *   → "POST:/predictions:uuid-123"
   */
  private buildStoredKey(
    method: string,
    routePattern: string,
    clientKey: string,
  ): string {
    return `${method}:${routePattern}:${clientKey}`;
  }
}
