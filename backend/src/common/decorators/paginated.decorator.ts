import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route handler as returning a paginated response.
 *
 * When present, the `ResponseInterceptor` reads `nextCursor` and `total` from
 * the handler's return value and lifts them into a `pagination` block in the
 * standard envelope.  The handler's payload remains in `data` unchanged.
 *
 * Expected handler return shape:
 * ```ts
 * { items: T[]; total?: number; nextCursor?: string | null }
 * ```
 *
 * Routes **without** this decorator are unaffected.
 */
export const PAGINATED_KEY = 'isPaginated';
export const Paginated = () => SetMetadata(PAGINATED_KEY, true);
