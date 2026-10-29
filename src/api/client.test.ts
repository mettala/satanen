import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTab } from '../sections/destination';
import {
  getPage,
  pageImageUrl,
  proxyUrl,
  reportOpened,
  REQUEST_TIMEOUT_MS,
  shouldReportOpen,
} from './client';

const fixture = readFileSync(join(__dirname, '../../fixtures/pages/100.json'), 'utf8');

function jsonResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('EXPO_PUBLIC_PROXY_URL', 'http://proxy.test');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getPage', () => {
  it('fetches the page through the proxy and returns the parsed page', async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    const r = await getPage(100);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://proxy.test/v1/pages/100.json');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.page.number).toBe(100);
      expect(r.raw).toEqual(JSON.parse(fixture));
      expect(r.stale).toBe(false);
      expect(r.fetchedAt).toBeNull();
    }
  });

  it('asks for a fresh copy with ?fresh=1 and no request headers (no CORS preflight)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    const r = await getPage(100, { fresh: true });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://proxy.test/v1/pages/100.json?fresh=1');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toBeUndefined();
    expect(init.method).toBeUndefined();
    expect(init.cache).toBeUndefined();
  });

  it('a plain request has no query', async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    await getPage(100, { fresh: false });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://proxy.test/v1/pages/100.json');
  });

  it('reads the stale and fetched-at headers', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(fixture, {
        headers: { 'X-Satanen-Stale': '1', 'X-Satanen-Fetched-At': '2026-10-22T11:32:00.000Z' },
      }),
    );
    const r = await getPage(100);
    expect(r.ok && r.stale).toBe(true);
    expect(r.ok && r.fetchedAt?.toISOString()).toBe('2026-10-22T11:32:00.000Z');
  });

  it('reads the limit from X-Satanen-Ttl (seconds) into milliseconds', async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture, { headers: { 'X-Satanen-Ttl': '240' } }));
    const r = await getPage(100);
    expect(r.ok && r.limitMs).toBe(240_000);
  });

  it('has no limit when the header is missing', async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    const r = await getPage(100);
    expect(r.ok && r.limitMs).toBeNull();
  });

  it.each(['0', '-60', 'abc', '', '1e3', 'NaN', 'Infinity'])(
    'has no limit for the invalid header "%s"',
    async (value) => {
      fetchMock.mockResolvedValue(jsonResponse(fixture, { headers: { 'X-Satanen-Ttl': value } }));
      const r = await getPage(100);
      expect(r.ok && r.limitMs).toBeNull();
    },
  );

  it('cuts a huge limit to one hour', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(fixture, { headers: { 'X-Satanen-Ttl': '99999999' } }),
    );
    const r = await getPage(100);
    expect(r.ok && r.limitMs).toBe(3_600_000);
  });

  it('ignores an unreadable fetched-at header', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(fixture, { headers: { 'X-Satanen-Fetched-At': 'x' } }),
    );
    const r = await getPage(100);
    expect(r.ok && r.fetchedAt).toBeNull();
  });

  it('maps 404 to not-found', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{"error":"not-found"}', { status: 404 }));
    expect(await getPage(150)).toEqual({ ok: false, reason: 'not-found' });
  });

  it.each([500, 502, 503])('maps %i to upstream', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse('{"error":"upstream"}', { status }));
    expect(await getPage(100)).toEqual({ ok: false, reason: 'upstream' });
  });

  it('maps a network failure to offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await getPage(100)).toEqual({ ok: false, reason: 'offline' });
  });

  it('maps invalid JSON to bad-data', async () => {
    fetchMock.mockResolvedValue(jsonResponse('<html>oops'));
    expect(await getPage(100)).toEqual({ ok: false, reason: 'bad-data' });
  });

  it('maps JSON that is not a page to bad-data', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{"hello":1}'));
    expect(await getPage(100)).toEqual({ ok: false, reason: 'bad-data' });
  });

  it.each([99, 900, 100.5, NaN, -1, '100' as unknown as number])(
    'rejects invalid page number %s without fetching',
    async (n) => {
      expect(await getPage(n)).toEqual({ ok: false, reason: 'not-found' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('gives up after 10 seconds and reports offline', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const p = getPage(100);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toEqual({ ok: false, reason: 'offline' });
  });

  it('never throws, even when fetch throws synchronously', async () => {
    fetchMock.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await getPage(100)).toEqual({ ok: false, reason: 'offline' });
  });
});

describe('proxyUrl', () => {
  it('defaults to api.satanen.io', () => {
    vi.stubEnv('EXPO_PUBLIC_PROXY_URL', '');
    expect(proxyUrl()).toBe('https://api.satanen.io');
  });

  it('strips trailing slashes', () => {
    vi.stubEnv('EXPO_PUBLIC_PROXY_URL', 'http://localhost:8787/');
    expect(proxyUrl()).toBe('http://localhost:8787');
  });
});

describe('pageImageUrl', () => {
  it('builds the proxy image URL, subpage defaulting to 1', () => {
    expect(pageImageUrl(201)).toBe('http://proxy.test/v1/images/201/1.png');
    expect(pageImageUrl(201, 3)).toBe('http://proxy.test/v1/images/201/3.png');
  });

  it('returns null for invalid input', () => {
    expect(pageImageUrl(99)).toBeNull();
    expect(pageImageUrl(100, 0)).toBeNull();
    expect(pageImageUrl(100, 100)).toBeNull();
  });
});

describe('no Yle secrets or direct Yle calls in app code', () => {
  // Built from pieces so this file does not match its own search.
  const forbidden = ['external', 'api', 'yle', 'fi'].join('.');
  const keyName = ['app', 'key'].join('_');
  const envName = ['YLE', 'APP'].join('_');
  const needles = [forbidden, keyName, envName];

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.(tsx?|jsx?|json)$/.test(name) ? [p] : [];
    });
  }

  it('finds none under app/ or src/', () => {
    const root = join(__dirname, '../..');
    const hits = [...files(join(root, 'app')), ...files(join(root, 'src'))].filter((f) => {
      const text = readFileSync(f, 'utf8');
      return needles.some((n) => text.includes(n));
    });
    expect(hits).toEqual([]);
  });
});

describe('reportOpened', () => {
  it('posts to the opened route with no body and no custom headers', () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    reportOpened(105);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://proxy.test/v1/opened/105');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
    expect(init.credentials).toBeUndefined();
  });

  it.each([99, 900, 10.5, Number.NaN, -1])('sends nothing for page %s', (n) => {
    reportOpened(n);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a failing network without throwing or an unhandled rejection', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    expect(() => reportOpened(105)).not.toThrow();
    await Promise.resolve();
  });

  it('ignores fetch throwing straight away', () => {
    fetchMock.mockImplementation(() => {
      throw new Error('no fetch');
    });
    expect(() => reportOpened(105)).not.toThrow();
  });

  it('does not wait: returns nothing while the answer is still pending', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    expect(reportOpened(105)).toBeUndefined();
  });
});

describe('shouldReportOpen', () => {
  it('counts an ordinary page', () => {
    expect(shouldReportOpen(105, false, false)).toBe(true);
  });

  it('does not count an address that is not a page', () => {
    expect(shouldReportOpen(null, false, false)).toBe(false);
    expect(shouldReportOpen(99, false, false)).toBe(false);
    expect(shouldReportOpen(900, false, false)).toBe(false);
  });

  it('does not count section pages that redirect to their tab', () => {
    const tabPages = [100, 102, 130, 160, 201, 400];
    for (const n of tabPages) {
      expect(hasTab(n)).toBe(true); // the screen passes hasTab(n) as the second argument
      expect(shouldReportOpen(n, hasTab(n), false)).toBe(false);
    }
  });

  it('does not count while developing', () => {
    expect(shouldReportOpen(105, false, true)).toBe(false);
  });
});
