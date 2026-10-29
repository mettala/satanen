/**
 * Client for our own proxy (proxy/). The app never talks to Yle directly and
 * never holds the Yle key (AGENTS.md rule 1).
 */
import { limitFromHeader } from '../data/freshness';
import { normalize } from '../parser/normalize';
import type { Page } from '../parser/model';

export const DEFAULT_PROXY_URL = 'https://api.satanen.io';
export const REQUEST_TIMEOUT_MS = 10_000;

export type PageErrorReason = 'not-found' | 'offline' | 'upstream' | 'bad-data';

export type PageResult =
  | {
      ok: true;
      page: Page;
      /** The JSON exactly as the proxy sent it, for saving a device copy (D14). */
      raw: unknown;
      stale: boolean;
      fetchedAt: Date | null;
      /** The proxy's freshness limit in ms (`X-Satanen-Ttl`); null when missing or invalid. */
      limitMs: number | null;
    }
  | { ok: false; reason: PageErrorReason };

/** Base URL of the proxy without a trailing slash. Read per call so tests can change it. */
export function proxyUrl(): string {
  const raw = process.env.EXPO_PUBLIC_PROXY_URL?.trim();
  return (raw ? raw : DEFAULT_PROXY_URL).replace(/\/+$/, '');
}

export function isValidPageNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 100 && n <= 899;
}

export function isValidSubpage(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99;
}

/** URL of the PNG picture of a page (the fallback view). Null for invalid input. */
export function pageImageUrl(page: number, sub = 1): string | null {
  if (!isValidPageNumber(page) || !isValidSubpage(sub)) return null;
  return `${proxyUrl()}/v1/images/${page}/${sub}.png`;
}

function parseFetchedAt(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface GetPageOptions {
  /**
   * Ask the proxy for a newer copy than the one it holds (D39 C, FR.4): the
   * article didn't match its list. The proxy decides (at most once per 30 s
   * per page). Sent as `?fresh=1`, not as a request header: a header such as
   * `Cache-Control: no-cache` would make browsers send a CORS preflight.
   */
  fresh?: boolean;
}

/** The address of page `n` on the proxy. */
export function pageUrl(n: number, options: GetPageOptions = {}): string {
  return `${proxyUrl()}/v1/pages/${n}.json${options.fresh ? '?fresh=1' : ''}`;
}

/** Fetches one page through the proxy. Never throws. */
export async function getPage(n: number, options: GetPageOptions = {}): Promise<PageResult> {
  if (!isValidPageNumber(n)) return { ok: false, reason: 'not-found' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      // No custom headers, so a browser sends no preflight.
      res = await fetch(pageUrl(n, options), { signal: controller.signal });
    } catch {
      return { ok: false, reason: 'offline' };
    }

    if (res.status === 404) return { ok: false, reason: 'not-found' };
    if (!res.ok) return { ok: false, reason: 'upstream' };

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: 'bad-data' };
    }

    const result = normalize(body);
    if (!result.ok) return { ok: false, reason: 'bad-data' };

    return {
      ok: true,
      page: result.page,
      raw: body,
      stale: res.headers.get('X-Satanen-Stale') === '1',
      fetchedAt: parseFetchedAt(res.headers.get('X-Satanen-Fetched-At')),
      limitMs: limitFromHeader(res.headers.get('X-Satanen-Ttl')),
    };
  } catch {
    return { ok: false, reason: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tells the proxy that a reader opened page `n`, for the page counts
 * (D32). Sends no body, no cookie and no ID, and never waits, throws or shows
 * anything: counting is not allowed to get in the reader's way.
 */
export function reportOpened(n: number): void {
  if (!isValidPageNumber(n)) return;
  try {
    // Plain POST without custom headers, so browsers send no preflight.
    fetch(`${proxyUrl()}/v1/opened/${n}`, { method: 'POST', keepalive: true }).catch(
      () => undefined,
    );
  } catch {
    // fetch missing or throwing: nothing to do
  }
}

/**
 * Whether landing on this page counts as a reader opening it (D32). Not for an
 * address that isn't a page, not for section pages that redirect to their tab
 * (the tab shows no article), and not while developing, so our own testing
 * isn't counted as readers.
 */
export function shouldReportOpen(
  page: number | null,
  opensOwnTab: boolean,
  isDevelopment: boolean,
): page is number {
  return page !== null && isValidPageNumber(page) && !opensOwnTab && !isDevelopment;
}
