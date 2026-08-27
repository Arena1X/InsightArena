import { SetMetadata } from '@nestjs/common';

export const DEPRECATED_METADATA_KEY = 'apiDeprecated';

export interface DeprecatedOptions {
  /** ISO 8601 date (or HTTP-date) the route will stop being served, sent as the Sunset header. */
  sunset: string;
  /** Optional link to migration docs, sent as a Link header with rel="deprecation". */
  link?: string;
}

/**
 * Marks a route (or every route on a controller) as deprecated. Read by
 * DeprecationInterceptor to emit the `Deprecation` and `Sunset` response
 * headers defined by draft-ietf-httpapi-deprecation-header, signalling
 * clients to migrate before `sunset`.
 */
export const Deprecated = (options: DeprecatedOptions) =>
  SetMetadata(DEPRECATED_METADATA_KEY, options);
