/** Small helpers for the live mode of the dev preview. */
import type { PageErrorReason } from '../api';
import { formatHourMinute } from '../ui/page/format';

/** "14:32" in the phone's local time (Finnish style, no seconds). */
export function formatClock(d: Date): string {
  return formatHourMinute(d.getHours(), d.getMinutes());
}

/** Parses the page field; null unless it is a whole number 100-899. */
export function parsePageField(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 100 && n <= 899 ? n : null;
}

/** Which fi.ts message key to show for each failure. */
export function errorKey(
  reason: Exclude<PageErrorReason, 'not-found'>,
): 'offline' | 'upstream' | 'badData' {
  switch (reason) {
    case 'offline':
      return 'offline';
    case 'upstream':
      return 'upstream';
    default:
      return 'badData';
  }
}
