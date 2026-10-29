import { describe, expect, it } from 'vitest';
import { clockTime, formatHourMinute, pageDateTime } from './format';

describe('formatHourMinute', () => {
  it('uses a colon, no leading zero on the hour, two-digit minutes', () => {
    expect(formatHourMinute(14, 32)).toBe('14:32');
    expect(formatHourMinute(9, 5)).toBe('9:05');
    expect(formatHourMinute('09', '05')).toBe('9:05');
    expect(formatHourMinute(0, 13)).toBe('0:13');
    expect(formatHourMinute(0, 0)).toBe('0:00');
    expect(formatHourMinute(24, 0)).toBe('0:00');
  });
});

describe('pageDateTime', () => {
  it('reads Finnish local date and time from the page', () => {
    expect(pageDateTime({ time: '2026-10-21T14:32:07' })).toEqual({
      date: '21.10.',
      time: '14:32',
    });
    expect(pageDateTime({ time: '2026-01-05T05:06:37' })).toEqual({ date: '5.1.', time: '5:06' });
  });
  it('returns null without a usable time', () => {
    expect(pageDateTime({})).toBeNull();
    expect(pageDateTime({ time: 'huomenna' })).toBeNull();
  });
});

describe('clockTime', () => {
  it('shows Helsinki time as 14:32', () => {
    expect(clockTime(new Date('2026-10-21T11:32:00Z'))).toBe('14:32');
    expect(clockTime(new Date('2026-12-21T22:05:00Z'))).toBe('0:05');
  });
});
