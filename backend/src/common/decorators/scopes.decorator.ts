import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by ApiKeyGuard to read required scopes.
 * Usage:  @Scopes('predictions:read', 'markets:write')
 */
export const SCOPES_KEY = 'scopes';

/**
 * Decorator that declares which API-key scopes are required to access
 * a route or controller. Mirrors the pattern of @Roles().
 *
 * When applied, ApiKeyGuard will return 403 if the presenting key does
 * not include every listed scope.
 *
 * @example
 * @UseGuards(ApiKeyGuard)
 * @Scopes('predictions:read')
 * @Get()
 * findAll() { ... }
 */
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
