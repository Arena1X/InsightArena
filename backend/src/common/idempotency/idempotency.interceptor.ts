import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: { id: string } }>();
    const key = request.headers[IDEMPOTENCY_HEADER];

    if (!key || typeof key !== 'string') {
      throw new BadRequestException(
        `${IDEMPOTENCY_HEADER} header is required for this request`,
      );
    }

    const requestHash = createHash('sha256')
      .update(
        `${request.method}:${request.originalUrl}:${JSON.stringify(request.body ?? {})}`,
      )
      .digest('hex');

    const result = await this.idempotencyService.acquire(
      key,
      request.user.id,
      requestHash,
    );

    if (!result.acquired) {
      const { record } = result;
      if (record.request_hash !== requestHash) {
        throw new ConflictException(
          'Idempotency-Key was already used with a different request body',
        );
      }
      if (record.in_progress) {
        throw new ConflictException(
          'A request with this Idempotency-Key is already in progress',
        );
      }
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
