/**
 * Sanitizes free-text user input (e.g. prediction notes) that is stored and
 * later rendered to other consumers (API responses, CSV export). Strips
 * HTML/script-bearing markup and control characters so a malicious payload
 * can't be persisted as stored content, without a full HTML-parsing
 * dependency for what is meant to be plain text.
 */

/** Matches any HTML tag, e.g. `<script>`, `</div>`, `<img onerror=...>`. */
const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * Matches ASCII control characters (0x00-0x1F, 0x7F) other than the
 * whitespace we want to keep (tab, newline, carriage return).
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Strips HTML tags and control characters from free-text input, then trims
 * surrounding whitespace. Safe to apply repeatedly (idempotent).
 */
export function sanitizePlainText(input: string): string {
  return input
    .replace(HTML_TAG_PATTERN, '')
    .replace(CONTROL_CHAR_PATTERN, '')
    .trim();
}

/**
 * Sanitizes and enforces a maximum length on free-text input, truncating
 * (rather than rejecting) content that is still too long after sanitization
 * strips markup. Used as defense-in-depth alongside DTO-level `@MaxLength`
 * validation, in case sanitization itself is ever applied ahead of
 * validation or from a non-DTO call site.
 */
export function sanitizeAndBoundPlainText(
  input: string,
  maxLength: number,
): string {
  const sanitized = sanitizePlainText(input);
  return sanitized.length > maxLength
    ? sanitized.slice(0, maxLength)
    : sanitized;
}
