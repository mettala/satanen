/**
 * Live refresh of the section map: fetch the index pages through the proxy and
 * decide whether the result is safe to save. Pure apart from the injected
 * `fetchFn`; the script does the file writing.
 */
import { normalize } from '../parser/normalize';
import { buildEntries, INDEX_PAGES } from './generate';
import type { PageEntry } from './types';

export const DEFAULT_PROXY_URL = 'https://api.satanen.io';
/** The new map must keep at least this share of the current entries. */
export const MIN_KEEP_RATIO = 0.8;

export type LiveResult =
  { ok: true; pages: Map<number, unknown>; entries: PageEntry[] } | { ok: false; reason: string };

export async function fetchLiveIndex(
  fetchFn: typeof fetch,
  baseUrl: string,
  currentCount: number,
): Promise<LiveResult> {
  const base = baseUrl.replace(/\/+$/, '');
  const pages = new Map<number, unknown>();
  for (const n of INDEX_PAGES) {
    let raw: unknown;
    try {
      const res = await fetchFn(`${base}/v1/pages/${n}.json`);
      if (!res.ok) return { ok: false, reason: `page ${n}: HTTP ${res.status}` };
      raw = await res.json();
    } catch (error) {
      return { ok: false, reason: `page ${n}: ${error instanceof Error ? error.message : error}` };
    }
    if (!normalize(raw).ok) return { ok: false, reason: `page ${n}: not a valid teletext page` };
    pages.set(n, raw);
  }
  const entries = buildEntries(INDEX_PAGES.map((n) => pages.get(n)));
  if (entries.length < currentCount * MIN_KEEP_RATIO) {
    return {
      ok: false,
      reason: `new map has ${entries.length} entries, under ${MIN_KEEP_RATIO * 100} % of the current ${currentCount}`,
    };
  }
  return { ok: true, pages, entries };
}
