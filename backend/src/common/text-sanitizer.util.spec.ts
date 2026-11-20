import {
  sanitizePlainText,
  sanitizeAndBoundPlainText,
} from './text-sanitizer.util';

describe('sanitizePlainText', () => {
  it('strips HTML tags while keeping their text content', () => {
    expect(sanitizePlainText('<b>bold</b> and <i>italic</i>')).toBe(
      'bold and italic',
    );
  });

  it('strips a script tag and its markup, leaving inner text concatenated', () => {
    expect(sanitizePlainText('<script>alert(1)</script>hello')).toBe(
      'alert(1)hello',
    );
  });

  it('strips a self-closing/attribute-bearing tag such as an img onerror payload', () => {
    expect(sanitizePlainText('<img src=x onerror="alert(1)">caption')).toBe(
      'caption',
    );
  });

  it('strips ASCII control characters', () => {
    expect(sanitizePlainText('Bad\u0000actor\u0007note')).toBe('Badactornote');
  });

  it('keeps tabs, newlines, and carriage returns', () => {
    expect(sanitizePlainText('line1\nline2\tindented')).toBe(
      'line1\nline2\tindented',
    );
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizePlainText('   padded text   ')).toBe('padded text');
  });

  it('returns plain text unchanged', () => {
    expect(sanitizePlainText('I think this outcome is likely')).toBe(
      'I think this outcome is likely',
    );
  });

  it('returns an empty string for input that is only markup', () => {
    expect(sanitizePlainText('<div></div>')).toBe('');
  });

  it('is idempotent when applied twice', () => {
    const once = sanitizePlainText('<b>x</b>\u0000y');
    expect(sanitizePlainText(once)).toBe(once);
  });
});

describe('sanitizeAndBoundPlainText', () => {
  it('returns sanitized text unchanged when within the max length', () => {
    expect(sanitizeAndBoundPlainText('<b>short</b>', 100)).toBe('short');
  });

  it('truncates sanitized text that exceeds the max length', () => {
    const input = 'a'.repeat(50);
    expect(sanitizeAndBoundPlainText(input, 10)).toBe('a'.repeat(10));
  });

  it('truncates based on sanitized length, not raw length including markup', () => {
    const plain = 'a'.repeat(10);
    const withMarkup = `<b>${plain}</b>`;
    expect(sanitizeAndBoundPlainText(withMarkup, 10)).toBe(plain);
  });
});
