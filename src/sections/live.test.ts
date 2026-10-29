import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { INDEX_PAGES } from './generate';
import { fetchLiveIndex } from './live';
import { SECTION_MAP } from './sectionMap.generated';

const pagesDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../fixtures/pages');

function fixture(n: number): unknown {
  return JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8'));
}

function fakeFetch(overrides: Record<number, () => Response> = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const n = Number(/\/v1\/pages\/(\d+)\.json$/.exec(String(input))?.[1]);
    const override = overrides[n];
    if (override) return override();
    return new Response(JSON.stringify(fixture(n)), { status: 200 });
  });
}

const asFetch = (f: ReturnType<typeof fakeFetch>) => f as unknown as typeof fetch;

describe('fetchLiveIndex', () => {
  it('fetches every index page through the given base URL', async () => {
    const f = fakeFetch();
    const result = await fetchLiveIndex(asFetch(f), 'https://proxy.example/', SECTION_MAP.length);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.pages.keys()]).toEqual([...INDEX_PAGES]);
    expect(f).toHaveBeenCalledWith('https://proxy.example/v1/pages/199.json');
    expect(result.entries.length).toBeGreaterThanOrEqual(SECTION_MAP.length * 0.8);
  });

  it('fails (nothing to write) when a page returns an error status', async () => {
    const f = fakeFetch({ 300: () => new Response('nope', { status: 502 }) });
    const result = await fetchLiveIndex(asFetch(f), 'https://x', SECTION_MAP.length);
    expect(result).toEqual({ ok: false, reason: 'page 300: HTTP 502' });
  });

  it('fails when the network throws', async () => {
    const f = fakeFetch({
      400: () => {
        throw new Error('offline');
      },
    });
    const result = await fetchLiveIndex(asFetch(f), 'https://x', SECTION_MAP.length);
    expect(result).toEqual({ ok: false, reason: 'page 400: offline' });
  });

  it('fails when a page is not a teletext page', async () => {
    const f = fakeFetch({ 160: () => new Response('{"hello":1}', { status: 200 }) });
    const result = await fetchLiveIndex(asFetch(f), 'https://x', SECTION_MAP.length);
    expect(result.ok).toBe(false);
  });

  it('fails when the new map has under 80 % of the current entries', async () => {
    const first = await fetchLiveIndex(asFetch(fakeFetch()), 'https://x', 0);
    if (!first.ok) throw new Error('setup failed');
    const n = first.entries.length;
    const bad = await fetchLiveIndex(asFetch(fakeFetch()), 'https://x', Math.ceil(n / 0.79));
    expect(bad.ok).toBe(false);
    const fine = await fetchLiveIndex(asFetch(fakeFetch()), 'https://x', Math.floor(n / 0.8));
    expect(fine.ok).toBe(true);
  });
});
