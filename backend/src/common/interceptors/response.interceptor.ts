import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { PAGINATED_KEY } from '../decorators/paginated.decorator';
import { bindCorrelationId } from '../correlation-id';

export interface PaginationEnvelopeMeta {
  nextCursor: string | null;
  total?: number;
}

export interface ApiSuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
  pagination?: PaginationEnvelopeMeta;
}

/** Shape a paginated handler is expected to return. */
export interface PaginatedPayload<T = unknown> {
  items: T[];
  total?: number;
  nextCursor?: string | null;
}

const NO_BODY_STATUS_CODES = new Set([204, 304]);

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector?: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!context.getType || context.getType() === 'http') {
      const http = context.switchToHttp();
      const request = http.getRequest<Request>();
      const response = http.getResponse<Response>();
      if (request) {
        bindCorrelationId(request, response);
      }
    }

    const isPaginated = this.reflector?.getAllAndOverride<boolean | undefined>(
      PAGINATED_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((data: unknown) => {
        if (data instanceof StreamableFile) {
          return data;
        }

        const http = context.switchToHttp();
        const response = http.getResponse<Response>();
        if (response && NO_BODY_STATUS_CODES.has(response.statusCode)) {
          return data;
        }

        const envelope: ApiSuccessEnvelope = {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };

        if (isPaginated) {
          const payload = data as PaginatedPayload;
          const pagination: PaginationEnvelopeMeta = {
            nextCursor: payload.nextCursor ?? null,
          };
          if (payload.total !== undefined) {
            pagination.total = payload.total;
          }
          envelope.pagination = pagination;
        }

        return envelope;
      }),
    );
  }
}
