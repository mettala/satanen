// Page counts (D32, D45). No cookie, no stored ID, no IP address or browser
// string is ever written down. A reader is only a short daily identifier, made
// with a secret and the UTC date, so it changes every day and days can't be
// linked. It is still a pseudonymous identifier within one day, and the
// privacy texts say so.
//
// Data points in the Analytics Engine dataset (positions matter, see
// `proxy/src/stats.ts`):
//
//   a page opened by a reader
//     blobs   ['open', page, country, platform, dailyVisitor]
//     doubles [1]
//     indexes [page]
//
//   a request the Worker sent to Yle
//     blobs   ['yle', 'p<page>' | 'i<page>', outcome, dataCentre]
//     doubles [1]
//     indexes ['yle']
//
// `outcome` is ok, not-found, timeout, failed or status-<code> (status-401 is
// Yle's "quota used up" answer). `dataCentre` is Cloudflare's three-letter
// code for the data centre that asked (`request.cf.colo`, e.g. ARN for
// Stockholm), or XXX when unknown; added 25.10.2026 (D39), so older records
// have it empty.
//
// New fields only ever go at the end; existing positions never change.

/** The part of an Analytics Engine dataset binding that we use; tests pass a fake. */
export interface AnalyticsDataset {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

export interface AnalyticsEnv {
  ANALYTICS?: AnalyticsDataset;
  /** Secret that makes the daily visitor hash impossible to guess from an IP address. */
  ANALYTICS_SALT?: string;
}

export type Platform = 'web' | 'app';

const encoder = new TextEncoder();

/** Hex characters kept of the daily identifier (48 bits). */
export const DAILY_VISITOR_LENGTH = 12;

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The same reader gives the same hash for one UTC day and a different one on
 * the next, because the day is part of what is hashed. Only the first 12 hex
 * characters (48 bits) are kept: plenty to tell a day's readers apart, and
 * too little to be a fingerprint of an IP address (D45).
 */
export async function dailyVisitor(
  secret: string,
  utcDay: string,
  ip: string,
  userAgent: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${utcDay}|${ip}|${userAgent}`),
  );
  return toHex(signature).slice(0, DAILY_VISITOR_LENGTH);
}

/** A page opened in the web app has an Origin header; the Android app has none. */
export function platformOf(request: Request): Platform {
  return request.headers.get('Origin') ? 'web' : 'app';
}

function countryOf(request: Request): string {
  const country = (request as { cf?: { country?: unknown } }).cf?.country;
  return typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : 'XX';
}

/** Cloudflare's data centre code (`ARN`, `HEL`…), or `XXX` when there is none (tests, wrangler dev). */
export function coloOf(request: Request): string {
  const colo = (request as { cf?: { colo?: unknown } }).cf?.colo;
  return typeof colo === 'string' && /^[A-Z]{3}$/.test(colo) ? colo : 'XXX';
}

/** Counts one page opened by a reader. Never throws and never waits for anything slow. */
export async function recordOpen(
  env: AnalyticsEnv,
  request: Request,
  page: string,
  nowMs: number,
): Promise<void> {
  try {
    if (!env.ANALYTICS || !env.ANALYTICS_SALT) return;
    const visitor = await dailyVisitor(
      env.ANALYTICS_SALT,
      new Date(nowMs).toISOString().slice(0, 10),
      request.headers.get('CF-Connecting-IP') ?? '',
      request.headers.get('User-Agent') ?? '',
    );
    env.ANALYTICS.writeDataPoint({
      blobs: ['open', page, countryOf(request), platformOf(request), visitor],
      doubles: [1],
      indexes: [page],
    });
  } catch {
    // Counting must never break an answer. Nothing is logged: it could hold what we promised not to keep.
  }
}

/**
 * Counts one request the Worker sent to Yle, to watch Yle's 300-an-hour limit.
 * The data centre shows whether the per-centre cache (D39) costs us.
 */
export function recordYle(
  env: AnalyticsEnv,
  target: string,
  outcome: string,
  dataCentre: string,
): void {
  try {
    env.ANALYTICS?.writeDataPoint({
      blobs: ['yle', target, outcome, dataCentre],
      doubles: [1],
      indexes: ['yle'],
    });
  } catch {
    // see recordOpen
  }
}
