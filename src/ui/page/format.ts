import type { Page } from '../../parser/model';

/**
 * The one rule for writing a clock time (owner decision 2026-10-25): hours and
 * minutes with a colon, the hour without a leading zero, minutes always two
 * digits. `14:32`, `9:05`, and midnight is `0:13` / `0:00`.
 */
export function formatHourMinute(hour: number | string, minute: number | string): string {
  return `${Number(hour) % 24}:${String(Number(minute)).padStart(2, '0')}`;
}

/**
 * Date and time of a page for the article label, from the page's own Finnish
 * local time (`"2026-10-21T05:26:37"`): `{ date: "21.10.", time: "5:26" }`.
 * Null when the page has no usable time.
 */
export function pageDateTime(page: Pick<Page, 'time'>): { date: string; time: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(page.time ?? '');
  if (!m) return null;
  return { date: `${Number(m[3])}.${Number(m[2])}.`, time: formatHourMinute(m[4], m[5]) };
}

/** Finnish clock time such as "14:32" for a moment, in Helsinki time. */
export function clockTime(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Helsinki',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const h = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const min = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return formatHourMinute(h, min);
  } catch {
    return formatHourMinute(date.getHours(), date.getMinutes());
  }
}
