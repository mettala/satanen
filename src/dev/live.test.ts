import { describe, expect, it } from 'vitest';
import { errorKey, formatClock, parsePageField } from './live';

describe('formatClock', () => {
  it('uses a dot and two-digit minutes', () => {
    expect(formatClock(new Date(2026, 9, 22, 14, 32))).toBe('14:32');
    expect(formatClock(new Date(2026, 9, 22, 9, 5))).toBe('9:05');
  });
});

describe('parsePageField', () => {
  it.each([
    ['100', 100],
    [' 899 ', 899],
  ])('accepts %s', (raw, n) => expect(parsePageField(raw)).toBe(n));
  it.each(['', '99', '900', '1a0', '1000', '10.0'])('rejects %s', (raw) =>
    expect(parsePageField(raw)).toBeNull(),
  );
});

describe('errorKey', () => {
  it('maps every reason', () => {
    expect(errorKey('offline')).toBe('offline');
    expect(errorKey('upstream')).toBe('upstream');
    expect(errorKey('bad-data')).toBe('badData');
  });
});
