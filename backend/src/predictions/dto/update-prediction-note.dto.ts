import { IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { sanitizePlainText } from '../../common/text-sanitizer.util';

/**
 * Maximum note length, in characters, measured after sanitization. Longer
 * notes are rejected (HTTP 400) rather than silently truncated.
 */
export const PREDICTION_NOTE_MAX_LENGTH = 1000;

/**
 * Matches a `<` that opens a tag but was never closed (e.g. a trailing
 * `<img src=x onerror=alert(1)`), which the complete-tag pattern in
 * `sanitizePlainText` leaves behind. A `<` followed by a space or digit
 * (e.g. `BTC < 100k`, `<5%`) is ordinary text and is kept.
 */
const DANGLING_TAG_OPENER_PATTERN = /<(?=[a-zA-Z!/?])/g;

/**
 * Sanitize a prediction note: strip complete HTML tags and control
 * characters, then neutralise any unterminated tag opener so no markup can
 * be stored. Plain-text notes are returned unchanged (apart from trimming).
 */
export function sanitizePredictionNote(note: string): string {
  return sanitizePlainText(note)
    .replace(DANGLING_TAG_OPENER_PATTERN, '')
    .trim();
}

export class UpdatePredictionNoteDto {
  @ApiProperty({
    description:
      'Personal note for the prediction. HTML/markup and control characters are stripped; the sanitized note must not exceed the maximum length.',
    example: 'I think this outcome is likely based on recent trends',
    maxLength: PREDICTION_NOTE_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? sanitizePredictionNote(value) : value,
  )
  @IsString()
  @MaxLength(PREDICTION_NOTE_MAX_LENGTH, {
    message: `note must be shorter than or equal to ${PREDICTION_NOTE_MAX_LENGTH} characters`,
  })
  note: string;
}
