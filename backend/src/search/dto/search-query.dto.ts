import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Custom validator to ensure the query is not whitespace-only after trimming
 */
@ValidatorConstraint({ name: 'isNotWhitespaceOnly', async: false })
export class IsNotWhitespaceOnly implements ValidatorConstraintInterface {
  validate(text: string) {
    return typeof text === 'string' && text.trim().length > 0;
  }

  defaultMessage() {
    return 'Search query cannot be empty or whitespace-only';
  }
}

/**
 * DTO for validating search query strings with:
 * - Minimum length of 2 characters (after trimming)
 * - Maximum length of 100 characters (after trimming)
 * - Whitespace normalization (collapse internal spaces)
 * - SQL LIKE wildcard escaping (%, _)
 */
export class SearchQueryDto {
  @ApiProperty({
    description:
      'Search query string (2-100 characters, trimmed, wildcards escaped)',
    example: 'bitcoin price',
    minLength: 2,
    maxLength: 100,
  })
  @IsString({ message: 'Search query must be a string' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    // 1. Trim leading/trailing whitespace
    // 2. Normalize internal whitespace (collapse multiple spaces to single space)
    return value.trim().replace(/\s+/g, ' ');
  })
  @Validate(IsNotWhitespaceOnly)
  @MinLength(2, {
    message: 'Search query must be at least 2 characters long',
  })
  @MaxLength(100, {
    message: 'Search query must not exceed 100 characters',
  })
  query: string;
}

/**
 * Escapes SQL LIKE wildcards (% and _) in user input so they match literally.
 * This prevents users from injecting wildcard patterns that could cause
 * performance issues or unexpected behavior.
 *
 * @param input - The user-provided search string
 * @returns The sanitized string with % and _ escaped as \% and \_
 *
 * @example
 * escapeLikeWildcards('100%') // returns '100\\%'
 * escapeLikeWildcards('user_name') // returns 'user\\_name'
 */
export function escapeLikeWildcards(input: string): string {
  if (!input) return input;
  return input.replace(/([%_])/g, '\\$1');
}
