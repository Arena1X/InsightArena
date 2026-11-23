import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  PREDICTION_NOTE_MAX_LENGTH,
  UpdatePredictionNoteDto,
  sanitizePredictionNote,
} from './update-prediction-note.dto';

describe('UpdatePredictionNoteDto', () => {
  it('rejects an over-length note with a clear error', async () => {
    const dto = plainToInstance(UpdatePredictionNoteDto, {
      note: 'a'.repeat(PREDICTION_NOTE_MAX_LENGTH + 1),
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('note');
    expect(errors[0].constraints?.maxLength).toBe(
      `note must be shorter than or equal to ${PREDICTION_NOTE_MAX_LENGTH} characters`,
    );
  });

  it('accepts a note of exactly the maximum length', async () => {
    const dto = plainToInstance(UpdatePredictionNoteDto, {
      note: 'a'.repeat(PREDICTION_NOTE_MAX_LENGTH),
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('sanitizes a note with embedded script markup', async () => {
    const dto = plainToInstance(UpdatePredictionNoteDto, {
      note: '<script>alert(1)</script>Looks <b>bullish</b>',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.note).toBe('alert(1)Looks bullish');
    expect(dto.note).not.toMatch(/[<>]/);
  });

  it('neutralises an unterminated tag that the tag pattern cannot match', async () => {
    const dto = plainToInstance(UpdatePredictionNoteDto, {
      note: 'nice <img src=x onerror=alert(1)',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.note).toBe('nice img src=x onerror=alert(1)');
    expect(dto.note).not.toContain('<');
  });

  it('stores a normal note unchanged', async () => {
    const note = 'BTC < 100k by June & volume is up 20%.\nStill bullish.';
    const dto = plainToInstance(UpdatePredictionNoteDto, { note });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.note).toBe(note);
  });

  it('rejects a non-string note', async () => {
    const dto = plainToInstance(UpdatePredictionNoteDto, { note: 123 });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'note')).toBe(true);
  });
});

describe('sanitizePredictionNote', () => {
  it('is idempotent', () => {
    const once = sanitizePredictionNote('<b>x</b> <i\u0000y');
    expect(sanitizePredictionNote(once)).toBe(once);
  });
});
