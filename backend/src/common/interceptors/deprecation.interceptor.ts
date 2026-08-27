import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import type { Response } from 'express';
import {
  DEPRECATED_METADATA_KEY,
  DeprecatedOptions,
} from '../decorators/deprecated.decorator';

/**
 * Emits `Deprecation` and `Sunset` response headers (per
 * draft-ietf-httpapi-deprecation-header) on any route marked with
 * `@Deprecated(...)`, so clients get a machine-readable migration signal
 * instead of silently continuing to call a route that will be removed.
 *
 * Routes without the decorator are untouched — no headers are added.
 */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<
      DeprecatedOptions | undefined
    >(DEPRECATED_METADATA_KEY, [context.getHandler(), context.getClass()]);

    if (options) {
      const response = context.switchToHttp().getResponse<Response>();
      response.setHeader('Deprecation', 'true');
      response.setHeader('Sunset', options.sunset);
      if (options.link) {
        response.setHeader('Link', `<${options.link}>; rel="deprecation"`);
      }
    }

    return next.handle();
  }
}
