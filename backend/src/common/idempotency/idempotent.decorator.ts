import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';

export const IDEMPOTENT_KEY = 'idempotent';

/** Marks a write route as requiring an `Idempotency-Key` request header. */
export function Idempotent() {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, true),
    UseInterceptors(IdempotencyInterceptor),
  );
}
