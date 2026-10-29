import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle, subpageCountOf, type CacheLike, type Env, type YleOutcome } from './index.ts';
import { YLE_HOURLY_CAP, YleBudget } from './ttl.ts';
import { ERROR_PAUSE_S, InFlight, QUOTA_PAUSE_S, YlePause } from './upstream.ts';
import wranglerToml from '../wrangler.toml?raw';
import packageJson from '../package.json?raw';
import fixture100 from '../../fixtures/pages/100.json?raw';
import fixture103 from '../../fixtures/pages/103.json?raw';
import fixture112 from '../../fixtures/pages/112.json?raw';
import fixture242 from '../../fixtures/pages/242.json?raw';
import fixture417 from '../../fixtures/pages/417.json?raw';

const APP_ID = 'test-id-not-a-real-id';
const APP_KEY = 'test-key-not-a-real-key';
/** The production list, read from wrangler.toml so the tests follow the real setting. */
const PROD_ORIGINS = /^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m.exec(wranglerToml)?.[1] ?? '';
/** What `npm run dev` injects (package.json), for the app on localhost:8081. */
const DEV_ORIGINS = /--var ALLOWED_ORIGINS:(\S+?)"/.exec(packageJson)?.[1] ?? '';
const env: Env = {
  YLE_APP_ID: APP_ID,
  YLE_APP_KEY: APP_KEY,
  ALLOWED_ORIGINS: PROD_ORIGINS,
};
const devEnv: Env = { ...env, ALLOWED_ORIGINS: DEV_ORIGINS };

const PAGE_JSON = '{"teletext":{"page":{"number":"100"}}}';
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const YLE_404 = '<Error><Code>NoSuchKey</Code></Error>';

let fetchMock: ReturnType<typeof vi.fn>;
let logged: string[];

/** A fake Workers cache: a Map, no expiry of its own (the Worker checks ages itself). */
class FakeCache implements CacheLike {
  store = new Map<string, Response>();
  puts: string[] = [];
  async match(key: Request) {
    return this.store.get(key.url)?.clone();
  }
  async put(key: Request, res: Response) {
    this.puts.push(key.url);
    this.store.set(key.url, res.clone());
  }
}

let cache: FakeCache;
let clock: number;
/** Everything any request handed to `waitUntil`. */
let waiting: Promise<unknown>[];

/**
 * A Worker `ctx` for one request. `done()` waits only for what this request
 * handed to `waitUntil`, not for another request's Yle answer still in flight
 * (identical requests share one, PUB.14).
 */
function requestCtx() {
  const own: Promise<unknown>[] = [];
  return {
    waitUntil(p: Promise<unknown>) {
      own.push(p);
      waiting.push(p);
    },
    done: () => Promise.all(own),
  };
}

function callWith(request: Request, e: Env, ctx = requestCtx()) {
  return handle(request, e, ctx, { cache, now: () => clock });
}

async function call(path: string, init: RequestInit = {}) {
  const ctx = requestCtx();
  const res = await callWith(new Request(`https://api.satanen.io${path}`, init), env, ctx);
  await ctx.done();
  return res;
}

async function everythingVisible(res: Response): Promise<string> {
  const headers = [...res.headers].map(([k, v]) => `${k}: ${v}`).join('\n');
  return `${headers}\n${await res.clone().text()}\n${logged.join('\n')}`;
}

beforeEach(() => {
  logged = [];
  cache = new FakeCache();
  clock = Date.parse('2026-10-22T12:00:00Z');
  waiting = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
  }
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the Worker module', () => {
  it('exports only functions and the handler, or the Workers runtime will not start it', async () => {
    const mod: Record<string, unknown> = await import('./index.ts');
    const bad = Object.entries(mod).filter(
      ([name, value]) => name !== 'default' && typeof value !== 'function',
    );
    expect(bad.map(([name]) => name)).toEqual([]);
    expect(typeof (mod.default as { fetch?: unknown }).fetch).toBe('function');
  });
});

describe('page route', () => {
  it('passes Yle JSON through unchanged and adds the key only upstream', async () => {
    fetchMock.mockResolvedValue(new Response(PAGE_JSON, { status: 200 }));
    const res = await call('/v1/pages/100.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.text()).toBe(PAGE_JSON);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      'https://external.api.yle.fi/v1/teletext/pages/100.json',
    );
    expect(url.searchParams.get('app_id')).toBe(APP_ID);
    expect(url.searchParams.get('app_key')).toBe(APP_KEY);
  });

  it('accepts the whole range 100 to 899', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    expect((await call('/v1/pages/899.json')).status).toBe(200);
    expect((await call('/v1/pages/100.json')).status).toBe(200);
  });

  it.each([
    '/v1/pages/99.json',
    '/v1/pages/900.json',
    '/v1/pages/0100.json',
    '/v1/pages/abc.json',
    '/v1/pages/100.xml',
    '/v1/pages/100',
    '/v1/pages/',
  ])('rejects %s without calling Yle', async (path) => {
    const res = await call(path);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores query strings from the caller', async () => {
    fetchMock.mockResolvedValue(new Response(PAGE_JSON));
    await call('/v1/pages/100.json?app_key=evil&x=1');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('app_key')).toBe(APP_KEY);
    expect(url.searchParams.has('x')).toBe(false);
  });

  it('answers HEAD without a body', async () => {
    fetchMock.mockResolvedValue(new Response(PAGE_JSON));
    const res = await call('/v1/pages/100.json', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

describe('image route', () => {
  it('returns the PNG', async () => {
    fetchMock.mockResolvedValue(
      new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } }),
    );
    const res = await call('/v1/images/100/1.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v1/teletext/images/100/1.png');
  });

  it.each([
    '/v1/images/100/0.png',
    '/v1/images/100/100.png',
    '/v1/images/100/01.png',
    '/v1/images/99/1.png',
    '/v1/images/100.png',
    '/v1/images/100/1.jpg',
  ])('rejects %s', async (path) => {
    const res = await call(path);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('routing and methods', () => {
  it('404s unknown paths with JSON', async () => {
    const res = await call('/');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'not-found' });
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('%s gives 405', async (method) => {
    const res = await call('/v1/pages/100.json', { method });
    expect(res.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('X-Content-Type-Options', () => {
  const ok = () =>
    new Response(PAGE_JSON, { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('is nosniff on pages, images, misses, errors, preflights, 405 and opened', async () => {
    fetchMock.mockImplementation(async () => ok());
    const cases: [string, RequestInit][] = [
      ['/v1/pages/100.json', {}],
      ['/v1/pages/100.json', { method: 'HEAD' }],
      ['/v1/images/100/1.png', {}],
      ['/v1/pages/100.json', { method: 'OPTIONS', headers: { Origin: 'https://satanen.io' } }],
      ['/v1/pages/100.json', { method: 'POST' }],
      ['/v1/opened/100', { method: 'POST' }],
      ['/v1/opened/100', {}],
      ['/nope', {}],
    ];
    for (const [path, init] of cases) {
      const res = await call(path, init);
      expect(res.headers.get('X-Content-Type-Options'), `${init.method ?? 'GET'} ${path}`).toBe(
        'nosniff',
      );
    }
  });

  it('is nosniff when Yle fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    const res = await call('/v1/pages/101.json');
    expect(res.status).toBe(502);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('Yle errors', () => {
  it('turns a Yle 404 (XML) into JSON not-found', async () => {
    fetchMock.mockResolvedValue(
      new Response(YLE_404, { status: 404, headers: { 'Content-Type': 'application/xml' } }),
    );
    const res = await call('/v1/pages/112.json');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'not-found' });
  });

  it('turns a Yle image 404 into JSON not-found', async () => {
    fetchMock.mockResolvedValue(new Response(YLE_404, { status: 404 }));
    const res = await call('/v1/images/112/1.png');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
  });

  it.each([500, 502, 503, 401, 429])('turns Yle %i into 502 upstream', async (status) => {
    fetchMock.mockResolvedValue(new Response('boom', { status }));
    const res = await call('/v1/pages/100.json');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream' });
  });

  it('turns a network failure into 502 upstream', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    const res = await call('/v1/pages/100.json');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream' });
  });

  it('gives up after 8 s with 502 upstream', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = call('/v1/pages/100.json');
    await vi.advanceTimersByTimeAsync(7999);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const res = await pending;
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream' });
  });

  it('answers 500 when the key is not configured, without calling Yle', async () => {
    const res = await callWith(new Request('https://api.satanen.io/v1/pages/100.json'), {
      ...env,
      YLE_APP_KEY: '',
    });
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CORS', () => {
  it('production allows only https://satanen.io (L2, PUB.14)', () => {
    expect(PROD_ORIGINS).toBe('https://satanen.io');
    expect(wranglerToml).not.toContain('localhost');
  });

  it('npm run dev adds localhost:8081 for the app in development', () => {
    expect(DEV_ORIGINS).toBe('https://satanen.io,http://localhost:8081');
  });

  it('echoes the allowed origin https://satanen.io', async () => {
    fetchMock.mockResolvedValue(new Response(PAGE_JSON));
    const res = await call('/v1/pages/100.json', { headers: { Origin: 'https://satanen.io' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    expect(res.headers.get('Vary')).toContain('Origin');
  });

  it('echoes http://localhost:8081 only where it is allowed (dev)', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    const h = { headers: { Origin: 'http://localhost:8081' } };
    const dev = await callWith(new Request('https://api.satanen.io/v1/pages/100.json', h), devEnv);
    expect(dev.status).toBe(200);
    expect(dev.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    const prod = await call('/v1/pages/101.json', h);
    expect(prod.status).toBe(403);
    expect(prod.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://evil.example',
    'https://satanen.io.evil.example',
    'http://satanen.io',
    'http://localhost:8081',
    'null',
    '*',
  ])('refuses origin %s with 403, no CORS header and no call to Yle', async (origin) => {
    fetchMock.mockResolvedValue(new Response(PAGE_JSON));
    const res = await call('/v1/pages/100.json', { headers: { Origin: origin } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Vary')).toContain('Origin');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends no CORS header without an Origin', async () => {
    fetchMock.mockResolvedValue(new Response(PAGE_JSON));
    const res = await call('/v1/pages/100.json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('adds CORS headers to error responses too', async () => {
    const notFound = await call('/nope', { headers: { Origin: 'https://satanen.io' } });
    expect(notFound.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }));
    const upstream = await call('/v1/pages/100.json', {
      headers: { Origin: 'https://satanen.io' },
    });
    expect(upstream.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    const bad = await call('/v1/pages/100.json', {
      method: 'POST',
      headers: { Origin: 'https://satanen.io' },
    });
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
  });

  it('exposes the cache headers to allowed origins on all paths', async () => {
    const expected = 'X-Satanen-Cache, X-Satanen-Stale, X-Satanen-Fetched-At, X-Satanen-Ttl';
    const h = { headers: { Origin: 'https://satanen.io' } };
    fetchMock.mockResolvedValue(new Response(PAGE_JSON));
    const ok = await call('/v1/pages/100.json', h);
    expect(ok.headers.get('Access-Control-Expose-Headers')).toBe(expected);
    const hit = await call('/v1/pages/100.json', h);
    expect(hit.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(hit.headers.get('Access-Control-Expose-Headers')).toBe(expected);
    const notFound = await call('/nope', h);
    expect(notFound.headers.get('Access-Control-Expose-Headers')).toBe(expected);
    const other = await call('/v1/pages/100.json', { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('Access-Control-Expose-Headers')).toBeNull();
  });

  it('answers OPTIONS with 204 and no call to Yle', async () => {
    const res = await call('/v1/pages/100.json', {
      method: 'OPTIONS',
      headers: { Origin: 'https://satanen.io', 'Access-Control-Request-Method': 'GET' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers OPTIONS from a disallowed origin with 403 and no CORS header', async () => {
    // Was 204 without CORS headers; either way the browser refuses (PUB.14).
    const res = await call('/v1/pages/100.json', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Origin check: another website is refused before the cache and Yle (PUB.14)', () => {
  const evil = { headers: { Origin: 'https://evil.example' } };

  it('does not read or write the cache', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call('/v1/pages/100.json');
    const reads = vi.spyOn(cache, 'match');
    const res = await call('/v1/pages/100.json', evil);
    expect(res.status).toBe(403);
    expect(reads).not.toHaveBeenCalled();
    expect(cache.puts).toHaveLength(2);
  });

  it.each([
    ['GET a page', '/v1/pages/105.json', 'GET'],
    ['HEAD a page', '/v1/pages/105.json', 'HEAD'],
    ['GET a picture', '/v1/images/105/1.png', 'GET'],
    ['an unknown path', '/nope', 'GET'],
    ['a wrong method', '/v1/pages/105.json', 'PUT'],
  ])('%s: 403', async (_name, path, method) => {
    const res = await call(path, { ...evil, method });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a request with no Origin (the app, <img>, scripts) works exactly as before', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    const res = await call('/v1/pages/100.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Satanen-Cache')).toBe('MISS');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the 403 never shows the key', async () => {
    const res = await call('/v1/pages/100.json', evil);
    const visible = await everythingVisible(res);
    for (const s of [APP_ID, APP_KEY, 'app_key', 'app_id']) expect(visible).not.toContain(s);
  });
});

describe('the Yle key never leaks', () => {
  const secretsIn = (text: string) =>
    [APP_ID, APP_KEY, 'app_key', 'app_id'].filter((s) => text.includes(s));

  it('not in successful responses', async () => {
    fetchMock.mockResolvedValue(new Response(PAGE_JSON));
    const res = await call('/v1/pages/100.json', { headers: { Origin: 'https://satanen.io' } });
    expect(secretsIn(await everythingVisible(res))).toEqual([]);
  });

  it('not in image responses', async () => {
    fetchMock.mockResolvedValue(new Response(PNG));
    const res = await call('/v1/images/100/1.png');
    expect(secretsIn(await everythingVisible(res))).toEqual([]);
  });

  it('not in error responses or logs, even when the failure message contains it', async () => {
    const leaky = new Error(
      `request to https://external.api.yle.fi/x?app_id=${APP_ID}&app_key=${APP_KEY} failed`,
    );
    const scenarios: Array<() => void> = [
      () => fetchMock.mockRejectedValue(leaky),
      () => fetchMock.mockResolvedValue(new Response(`bad app_key=${APP_KEY}`, { status: 500 })),
      () => fetchMock.mockResolvedValue(new Response(`<Error>${APP_KEY}</Error>`, { status: 404 })),
      () =>
        fetchMock.mockResolvedValue(
          new Response(`denied ${APP_ID}`, { status: 401, headers: { 'X-Echo': APP_KEY } }),
        ),
    ];
    for (const arrange of scenarios) {
      arrange();
      const res = await call('/v1/pages/100.json', { headers: { Origin: 'https://satanen.io' } });
      expect(secretsIn(await everythingVisible(res))).toEqual([]);
    }
  });

  it('not in 404, 405, OPTIONS and misconfiguration responses', async () => {
    const responses = [
      await call('/nope'),
      await call('/v1/pages/100.json', { method: 'POST' }),
      await call('/v1/pages/100.json', {
        method: 'OPTIONS',
        headers: { Origin: 'https://satanen.io' },
      }),
      await callWith(new Request('https://api.satanen.io/v1/pages/100.json'), {
        ...env,
        YLE_APP_ID: '',
      }),
    ];
    for (const res of responses) expect(secretsIn(await everythingVisible(res))).toEqual([]);
  });

  it('does not pass Yle response headers through', async () => {
    fetchMock.mockResolvedValue(
      new Response(PAGE_JSON, { headers: { 'Set-Cookie': 'a=b', 'X-Yle-Secret': APP_KEY } }),
    );
    const res = await call('/v1/pages/100.json');
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(res.headers.get('X-Yle-Secret')).toBeNull();
  });
});

describe('edge cache and last good copy', () => {
  // Page 100 is a headline list: kept 120 s at the edge, 30 s in the browser.
  const P = '/v1/pages/100.json';
  const advance = (s: number) => (clock += s * 1000);

  it('misses first, then hits without calling Yle again', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    const first = await call(P);
    expect(first.headers.get('X-Satanen-Cache')).toBe('MISS');
    expect(first.headers.get('X-Satanen-Fetched-At')).toBe('2026-10-22T12:00:00.000Z');
    expect(first.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect(first.headers.get('X-Satanen-Ttl')).toBe('120');
    advance(119);
    const second = await call(P);
    expect(second.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(second.headers.get('X-Satanen-Fetched-At')).toBe('2026-10-22T12:00:00.000Z');
    expect(second.headers.get('X-Satanen-Stale')).toBeNull();
    expect(await second.text()).toBe(PAGE_JSON);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches again after the page limit (120 s for page 100)', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call(P);
    advance(120);
    const res = await call(P);
    expect(res.headers.get('X-Satanen-Cache')).toBe('MISS');
    expect(res.headers.get('X-Satanen-Fetched-At')).toBe('2026-10-22T12:02:00.000Z');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores query strings and headers in the cache key', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call(P);
    const res = await call(`${P}?x=1`, { headers: { Origin: 'https://satanen.io' } });
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps pages and images apart', async () => {
    fetchMock.mockImplementation(async () => new Response(PNG));
    await call(P);
    const img = await call('/v1/images/100/1.png');
    expect(img.headers.get('X-Satanen-Cache')).toBe('MISS');
    expect(img.headers.get('Content-Type')).toBe('image/png');
    const again = await call('/v1/images/100/1.png');
    expect(again.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(PNG);
  });

  it('serves HEAD from the cache without a body', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call(P);
    const res = await call(P, { method: 'HEAD' });
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(await res.text()).toBe('');
  });

  it('writes to the cache through waitUntil', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    const res = await callWith(new Request(`https://api.satanen.io${P}`), env);
    expect(res.status).toBe(200);
    expect(waiting.length).toBeGreaterThan(0);
  });

  it('caches 404 for 30 s only', async () => {
    fetchMock.mockImplementation(async () => new Response(YLE_404, { status: 404 }));
    const first = await call('/v1/pages/112.json');
    expect(first.status).toBe(404);
    expect(first.headers.get('X-Satanen-Cache')).toBe('MISS');
    advance(29);
    const hit = await call('/v1/pages/112.json');
    expect(hit.status).toBe(404);
    expect(hit.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(await hit.json()).toEqual({ error: 'not-found' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    advance(1);
    const later = await call('/v1/pages/112.json');
    expect(later.headers.get('X-Satanen-Cache')).toBe('MISS');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never caches 5xx or network errors', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }));
    const res = await call(P);
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    fetchMock.mockRejectedValue(new TypeError('down'));
    await call(P);
    expect(cache.puts).toEqual([]);
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    expect((await call(P)).headers.get('X-Satanen-Cache')).toBe('MISS');
  });

  it.each([
    ['a 503', () => fetchMock.mockResolvedValue(new Response('x', { status: 503 }))],
    ['a network error', () => fetchMock.mockRejectedValue(new TypeError('down'))],
  ])('serves the last good copy as STALE on %s', async (_name, breakYle) => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call(P);
    advance(3600);
    breakYle();
    const res = await call(P, { headers: { Origin: 'https://satanen.io' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Satanen-Cache')).toBe('STALE');
    expect(res.headers.get('X-Satanen-Stale')).toBe('1');
    expect(res.headers.get('X-Satanen-Fetched-At')).toBe('2026-10-22T12:00:00.000Z');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    expect(await res.text()).toBe(PAGE_JSON);
  });

  it('serves the last good copy when Yle times out', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call(P);
    advance(120);
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_r, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = call(P);
    await vi.advanceTimersByTimeAsync(8001);
    const res = await pending;
    expect(res.headers.get('X-Satanen-Stale')).toBe('1');
  });

  it('answers 502 when the last good copy is older than 24 h', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call(P);
    advance(24 * 3600);
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }));
    const res = await call(P);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream' });
  });

  it('serves a 23 h old copy when Yle fails', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call(P);
    advance(23 * 3600);
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }));
    expect((await call(P)).headers.get('X-Satanen-Stale')).toBe('1');
  });

  it('does not serve a page as stale when Yle says it is gone', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call(P);
    advance(120);
    fetchMock.mockResolvedValue(new Response(YLE_404, { status: 404 }));
    expect((await call(P)).status).toBe(404);
  });

  it('keeps the key out of cached entries', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call(P);
    const dump = JSON.stringify([...cache.store.keys()]);
    expect(dump).not.toContain(APP_KEY);
    expect(dump).not.toContain(APP_ID);
  });
});

describe('one limit per kind of page (D39 B)', () => {
  const advance = (s: number) => (clock += s * 1000);
  let budget: YleBudget;
  const callB = async (path: string, init: RequestInit = {}) => {
    const ctx = requestCtx();
    const res = await handle(new Request(`https://api.satanen.io${path}`, init), env, ctx, {
      cache,
      now: () => clock,
      budget,
    });
    await ctx.done();
    return res;
  };

  beforeEach(() => {
    budget = new YleBudget();
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
  });

  it.each([
    ['live', 221, 60, 15],
    ['index', 102, 120, 30],
    ['news', 105, 300, 75],
    ['other (TV)', 301, 1800, 120],
    ['other (weather)', 401, 1800, 120],
  ])(
    '%s page %i: kept %i s, browser %i s, said in X-Satanen-Ttl',
    async (_k, page, ttl, browser) => {
      const path = `/v1/pages/${page}.json`;
      const first = await callB(path);
      expect(first.headers.get('X-Satanen-Ttl')).toBe(String(ttl));
      expect(first.headers.get('Cache-Control')).toBe(`public, max-age=${browser}`);
      advance(ttl - 1);
      const hit = await callB(path);
      expect(hit.headers.get('X-Satanen-Cache')).toBe('HIT');
      expect(hit.headers.get('X-Satanen-Ttl')).toBe(String(ttl));
      expect(hit.headers.get('Cache-Control')).toBe(`public, max-age=${browser}`);
      advance(1);
      expect((await callB(path)).headers.get('X-Satanen-Cache')).toBe('MISS');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it('a missing page is kept 30 s, browser 7 s, whatever its kind', async () => {
    fetchMock.mockImplementation(async () => new Response(YLE_404, { status: 404 }));
    const first = await callB('/v1/pages/301.json');
    expect(first.status).toBe(404);
    expect(first.headers.get('X-Satanen-Ttl')).toBe('30');
    expect(first.headers.get('Cache-Control')).toBe('public, max-age=7');
    advance(29);
    const hit = await callB('/v1/pages/301.json');
    expect(hit.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(hit.headers.get('X-Satanen-Ttl')).toBe('30');
    advance(1);
    expect((await callB('/v1/pages/301.json')).headers.get('X-Satanen-Cache')).toBe('MISS');
  });

  it('a picture of a page has the limit of its page', async () => {
    fetchMock.mockImplementation(async () => new Response(PNG));
    expect((await callB('/v1/images/221/1.png')).headers.get('X-Satanen-Ttl')).toBe('60');
    expect((await callB('/v1/images/105/1.png')).headers.get('X-Satanen-Ttl')).toBe('300');
    expect((await callB('/v1/images/401/1.png')).headers.get('X-Satanen-Ttl')).toBe('1800');
  });

  it('HEAD has the header too', async () => {
    const res = await callB('/v1/pages/221.json', { method: 'HEAD' });
    expect(res.headers.get('X-Satanen-Ttl')).toBe('60');
  });

  it('asks Cloudflare to hold the copy for twice the limit, so a doubling still finds it', async () => {
    await callB('/v1/pages/221.json');
    const stored = cache.store.get('https://cache.satanen.internal/fresh/v1/pages/221.json')!;
    expect(stored.headers.get('Cache-Control')).toBe('public, max-age=120');
    const lastGood = cache.store.get('https://cache.satanen.internal/last-good/v1/pages/221.json')!;
    expect(lastGood.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it.each([
    ['429', () => fetchMock.mockResolvedValue(new Response('slow down', { status: 429 }))],
    ['401', () => fetchMock.mockResolvedValue(new Response('quota', { status: 401 }))],
    ['503', () => fetchMock.mockResolvedValue(new Response('x', { status: 503 }))],
    ['a network error', () => fetchMock.mockRejectedValue(new TypeError('down'))],
  ])('Yle %s: the last good copy is served as STALE, with the limit', async (_name, breakYle) => {
    await callB('/v1/pages/221.json');
    advance(600);
    breakYle();
    const res = await callB('/v1/pages/221.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Satanen-Cache')).toBe('STALE');
    expect(res.headers.get('X-Satanen-Stale')).toBe('1');
    expect(res.headers.get('X-Satanen-Ttl')).toBe('60');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=15');
    expect(await res.text()).toBe(PAGE_JSON);
  });

  it('no X-Satanen-Ttl on errors', async () => {
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }));
    const res = await callB('/v1/pages/221.json');
    expect(res.status).toBe(502);
    expect(res.headers.get('X-Satanen-Ttl')).toBeNull();
  });

  describe("when this hour passes 70 % of Yle's 300 requests", () => {
    // The clock starts at 2026-10-22 12:00 UTC; the hour ends at 13:00.
    const fill = (n: number) => {
      for (let i = 0; i < n; i++) budget.record(clock);
    };

    it('every limit is doubled, and the browser age follows', async () => {
      fill(211);
      const live = await callB('/v1/pages/221.json');
      expect(live.headers.get('X-Satanen-Ttl')).toBe('120');
      expect(live.headers.get('Cache-Control')).toBe('public, max-age=30');
      expect((await callB('/v1/pages/105.json')).headers.get('X-Satanen-Ttl')).toBe('600');
      expect((await callB('/v1/pages/102.json')).headers.get('X-Satanen-Ttl')).toBe('240');
      const tv = await callB('/v1/pages/301.json');
      expect(tv.headers.get('X-Satanen-Ttl')).toBe('3600');
      expect(tv.headers.get('Cache-Control')).toBe('public, max-age=120');
      fetchMock.mockImplementation(async () => new Response(YLE_404, { status: 404 }));
      expect((await callB('/v1/pages/112.json')).headers.get('X-Satanen-Ttl')).toBe('60');
    });

    it('is not doubled at exactly 210', async () => {
      fill(209);
      // This request to Yle is the 210th: still the normal limit.
      expect((await callB('/v1/pages/221.json')).headers.get('X-Satanen-Ttl')).toBe('60');
      expect(budget.used(clock)).toBe(210);
      // The 211th tips it over.
      advance(60);
      const res = await callB('/v1/pages/221.json');
      expect(res.headers.get('X-Satanen-Cache')).toBe('MISS');
      expect(res.headers.get('X-Satanen-Ttl')).toBe('120');
    });

    it('a copy stored before the doubling stays fresh for the doubled limit', async () => {
      await callB('/v1/pages/221.json');
      fill(220);
      advance(90);
      const res = await callB('/v1/pages/221.json');
      expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
      expect(res.headers.get('X-Satanen-Ttl')).toBe('120');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('counts every request sent to Yle, failed ones too, and no cache hits', async () => {
      await callB('/v1/pages/221.json');
      await callB('/v1/pages/221.json');
      fetchMock.mockResolvedValue(new Response('x', { status: 503 }));
      await callB('/v1/pages/105.json');
      expect(budget.used(clock)).toBe(2);
    });

    it('goes back to normal at the next hour', async () => {
      // Past the doubling, below the hard cap (250, tested further down).
      fill(240);
      expect((await callB('/v1/pages/221.json')).headers.get('X-Satanen-Ttl')).toBe('120');
      clock = Date.parse('2026-10-22T13:00:00Z');
      const res = await callB('/v1/pages/221.json');
      expect(res.headers.get('X-Satanen-Cache')).toBe('MISS');
      expect(res.headers.get('X-Satanen-Ttl')).toBe('60');
    });
  });
});

describe('?fresh=1: the app asks again for one page (D39 C, FR.4)', () => {
  // Page 134 is a news article: kept 300 s at the edge.
  const P = '/v1/pages/134.json';
  const OLD = '{"teletext":{"page":{"number":"134","v":"old"}}}';
  const NEW = '{"teletext":{"page":{"number":"134","v":"new"}}}';
  const advance = (s: number) => (clock += s * 1000);
  let budget: YleBudget;
  let points: { blobs?: string[] }[];
  const analyticsEnv: Env = {
    ...env,
    ANALYTICS: { writeDataPoint: (p) => void points.push(p as { blobs?: string[] }) },
  };
  const callF = async (path: string, init: RequestInit = {}) => {
    const ctx = requestCtx();
    const res = await handle(
      new Request(`https://api.satanen.io${path}`, init),
      analyticsEnv,
      ctx,
      {
        cache,
        now: () => clock,
        budget,
      },
    );
    await ctx.done();
    return res;
  };
  const yleCount = () => points.filter((p) => p.blobs?.[0] === 'yle').length;

  beforeEach(async () => {
    budget = new YleBudget();
    points = [];
    fetchMock.mockImplementationOnce(async () => new Response(OLD));
    await callF(P);
    fetchMock.mockImplementation(async () => new Response(NEW));
  });

  it('is ignored while the stored copy is younger than 30 s', async () => {
    advance(29);
    const res = await callF(`${P}?fresh=1`);
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(await res.text()).toBe(OLD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks Yle again when the stored copy is 30 s old or more, and stores the answer', async () => {
    advance(30);
    const res = await callF(`${P}?fresh=1`);
    expect(res.headers.get('X-Satanen-Cache')).toBe('MISS');
    expect(res.headers.get('X-Satanen-Fetched-At')).toBe('2026-10-22T12:00:30.000Z');
    expect(await res.text()).toBe(NEW);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The plain address now gets the new copy: one cache entry, not one per query.
    const plain = await callF(P);
    expect(plain.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(await plain.text()).toBe(NEW);
    expect([...cache.store.keys()].sort()).toEqual([
      'https://cache.satanen.internal/fresh/v1/pages/134.json',
      'https://cache.satanen.internal/last-good/v1/pages/134.json',
    ]);
  });

  it('is honoured at most once per 30 s per page, judged from the stored time', async () => {
    advance(40);
    await callF(`${P}?fresh=1`);
    advance(29);
    // A second reader asking: the new copy is 29 s old.
    expect((await callF(`${P}?fresh=1`)).headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    advance(1);
    expect((await callF(`${P}?fresh=1`)).headers.get('X-Satanen-Cache')).toBe('MISS');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a new Worker copy follows the same rule (no memory, only the stored time)', async () => {
    advance(10);
    budget = new YleBudget();
    expect((await callF(`${P}?fresh=1`)).headers.get('X-Satanen-Cache')).toBe('HIT');
    advance(20);
    budget = new YleBudget();
    expect((await callF(`${P}?fresh=1`)).headers.get('X-Satanen-Cache')).toBe('MISS');
  });

  it('counts the extra Yle request like any other', async () => {
    expect(yleCount()).toBe(1);
    advance(30);
    await callF(`${P}?fresh=1`);
    expect(yleCount()).toBe(2);
    expect(budget.used(clock)).toBe(2);
    advance(1);
    await callF(`${P}?fresh=1`);
    expect(yleCount()).toBe(2);
  });

  it("is ignored while this hour is past 70 % of Yle's budget", async () => {
    for (let i = 0; i < 220; i++) budget.record(clock);
    advance(60);
    const res = await callF(`${P}?fresh=1`);
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['fresh=0', 'fresh=true', 'fresh', 'Fresh=1', 'x=1'])(
    'only fresh=1 counts (%s is ignored)',
    async (q) => {
      advance(60);
      expect((await callF(`${P}?${q}`)).headers.get('X-Satanen-Cache')).toBe('HIT');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('never passes the parameter or a caller-chosen query on to Yle', async () => {
    advance(30);
    await callF(`${P}?fresh=1&app_key=evil`);
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/v1/teletext/pages/134.json');
    expect(url.searchParams.has('fresh')).toBe(false);
    expect(url.searchParams.get('app_key')).toBe(APP_KEY);
  });

  it('when Yle fails, answers with the copy it skipped (still inside its limit)', async () => {
    advance(30);
    fetchMock.mockResolvedValue(new Response('x', { status: 503 }));
    const res = await callF(`${P}?fresh=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(res.headers.get('X-Satanen-Stale')).toBeNull();
    expect(await res.text()).toBe(OLD);
  });

  it('past the limit, a failed request falls back to the last good copy as usual', async () => {
    advance(300);
    fetchMock.mockRejectedValue(new TypeError('down'));
    const res = await callF(`${P}?fresh=1`);
    expect(res.headers.get('X-Satanen-Cache')).toBe('STALE');
    expect(await res.text()).toBe(OLD);
  });

  it('an article that has gone answers 404', async () => {
    advance(30);
    fetchMock.mockResolvedValue(new Response(YLE_404, { status: 404 }));
    expect((await callF(`${P}?fresh=1`)).status).toBe(404);
  });

  it('is ignored on images', async () => {
    fetchMock.mockImplementation(async () => new Response(PNG));
    await callF('/v1/images/134/1.png');
    advance(60);
    const res = await callF('/v1/images/134/1.png?fresh=1');
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    // The page in beforeEach, then the image once.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('opens no other route', async () => {
    expect((await callF('/v1/pages/134.json/x?fresh=1')).status).toBe(404);
    expect((await callF('/v1/opened/134?fresh=1', { method: 'POST' })).status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('CORS is unchanged: the preflight still allows only Content-Type', async () => {
    const res = await callF(`${P}?fresh=1`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://satanen.io', 'Access-Control-Request-Method': 'GET' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    advance(30);
    const get = await callF(`${P}?fresh=1`, { headers: { Origin: 'https://satanen.io' } });
    expect(get.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    expect(get.headers.get('Access-Control-Expose-Headers')).toContain('X-Satanen-Fetched-At');
  });
});

describe('hard cap: at most 250 Yle requests per Worker copy per hour (PUB.6)', () => {
  // The clock starts at 2026-10-22 12:00 UTC; the hour ends at 13:00.
  const advance = (s: number) => (clock += s * 1000);
  let budget: YleBudget;
  const callC = async (path: string, init: RequestInit = {}) => {
    const ctx = requestCtx();
    const res = await handle(new Request(`https://api.satanen.io${path}`, init), env, ctx, {
      cache,
      now: () => clock,
      budget,
    });
    await ctx.done();
    return res;
  };
  const fill = (n: number) => {
    for (let i = 0; i < n; i++) budget.record(clock);
  };

  beforeEach(() => {
    budget = new YleBudget();
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
  });

  it("is 250, below Yle's 300 an hour", () => {
    expect(YLE_HOURLY_CAP).toBe(250);
  });

  it('under the cap nothing changes: the 250th request still goes to Yle', async () => {
    fill(249);
    const res = await callC('/v1/pages/105.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Satanen-Cache')).toBe('MISS');
    expect(await res.text()).toBe(PAGE_JSON);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(budget.used(clock)).toBe(250);
  });

  it('at the cap, a page with nothing stored answers 503 busy and Yle is not asked', async () => {
    fill(250);
    const res = await callC('/v1/pages/105.json', { headers: { Origin: 'https://satanen.io' } });
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'busy' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(budget.used(clock)).toBe(250);
    expect(cache.puts).toEqual([]);
  });

  it('Retry-After says the seconds left in the hour', async () => {
    fill(250);
    advance(45 * 60 + 30);
    expect((await callC('/v1/pages/105.json')).headers.get('Retry-After')).toBe('870');
  });

  it('at the cap, a fresh copy is served as usual', async () => {
    await callC('/v1/pages/105.json');
    fill(250);
    advance(10);
    const res = await callC('/v1/pages/105.json');
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(await res.text()).toBe(PAGE_JSON);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('at the cap, an expired page gets its last good copy as STALE, and 503 after 24 h', async () => {
    await callC('/v1/pages/105.json');
    fetchMock.mockClear();
    fill(250);
    // News is 300 s, doubled to 600 s while the count is high.
    advance(601);
    const res = await callC('/v1/pages/105.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Satanen-Cache')).toBe('STALE');
    expect(res.headers.get('X-Satanen-Stale')).toBe('1');
    expect(await res.text()).toBe(PAGE_JSON);
    expect(fetchMock).not.toHaveBeenCalled();
    // A day later it is a new hour, so the count is filled again.
    advance(24 * 3600);
    fill(250);
    expect((await callC('/v1/pages/105.json')).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('at the cap, an expired stored 404 gives 503, not a call', async () => {
    fetchMock.mockImplementation(async () => new Response(YLE_404, { status: 404 }));
    await callC('/v1/pages/112.json');
    fetchMock.mockClear();
    fill(250);
    advance(61);
    expect((await callC('/v1/pages/112.json')).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('?fresh=1 respects the cap: the stored copy is served', async () => {
    await callC('/v1/pages/134.json');
    fill(250);
    advance(60);
    const res = await callC('/v1/pages/134.json?fresh=1');
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('images respect the cap too', async () => {
    fill(250);
    expect((await callC('/v1/images/100/1.png')).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HEAD at the cap: 503 and no call', async () => {
    fill(250);
    expect((await callC('/v1/pages/105.json', { method: 'HEAD' })).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is shared by every page and image: a script asking for all 800 pages costs Yle 250', async () => {
    const statuses: number[] = [];
    for (let page = 100; page <= 899; page++) {
      statuses.push((await callC(`/v1/pages/${page}.json`)).status);
    }
    expect(fetchMock).toHaveBeenCalledTimes(250);
    expect(statuses.slice(0, 250).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(250).every((s) => s === 503)).toBe(true);
    // Pictures go nowhere either; pages already fetched are still served.
    expect((await callC('/v1/images/500/1.png')).status).toBe(503);
    expect((await callC('/v1/pages/100.json')).headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(250);
  });

  it('holds for a burst: requests arriving while Yle is slow see the ones already sent', async () => {
    // Pages 110-114 were read earlier (with another Worker copy's count), so they have a last good copy.
    for (let page = 110; page <= 114; page++) await callC(`/v1/pages/${page}.json`);
    budget = new YleBudget();
    fill(245);
    // News is 300 s, doubled to 600 s while the count is high: every stored copy has expired.
    advance(601);
    fetchMock.mockClear();
    // A slow Yle: no answer until the test says so.
    const answer: Array<() => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => answer.push(() => resolve(new Response(PAGE_JSON)))),
    );
    let settled = 0;
    const pending = Array.from({ length: 20 }, (_, i) =>
      callC(`/v1/pages/${110 + i}.json`).then((res) => {
        settled += 1;
        return res;
      }),
    );
    // Wait until every request is either answered or waiting for Yle.
    await vi.waitFor(() => expect(settled + fetchMock.mock.calls.length).toBe(20));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(budget.used(clock)).toBe(250);
    for (const release of answer) release();
    const responses = await Promise.all(pending);
    const state = (res: Response) => res.headers.get('X-Satanen-Cache') ?? String(res.status);
    const states = responses.map(state);
    expect(states.filter((s) => s === 'MISS')).toHaveLength(5);
    responses.forEach((res, i) => {
      const s = states[i];
      if (s === 'STALE') expect(110 + i).toBeLessThanOrEqual(114);
      else if (s !== 'MISS') expect(res.status).toBe(503);
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('starts again at the next hour', async () => {
    fill(250);
    expect((await callC('/v1/pages/105.json')).status).toBe(503);
    clock = Date.parse('2026-10-22T13:00:00Z');
    const res = await callC('/v1/pages/105.json');
    expect(res.headers.get('X-Satanen-Cache')).toBe('MISS');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a 503 at the cap never shows the key, in the answer or the logs', async () => {
    fill(250);
    const res = await callC('/v1/pages/105.json', { headers: { Origin: 'https://satanen.io' } });
    const visible = await everythingVisible(res);
    for (const s of [APP_ID, APP_KEY, 'app_key', 'app_id']) expect(visible).not.toContain(s);
  });
});

describe('image subpage rule: only subpages the page has go to Yle (PUB.6)', () => {
  const advance = (s: number) => (clock += s * 1000);
  // Yle: page 100 has 4 subpages (fixture); every picture is a PNG.
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/pages/') ? new Response(fixture100) : new Response(PNG),
    );
  });
  const yleImageCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes('/images/')).length;

  describe('subpageCountOf, on saved pages', () => {
    it.each([
      ['100 (front page)', fixture100, 4],
      ['103 (one article)', fixture103, 1],
      ['242 (football table)', fixture242, 5],
      ['417 (44 subpages)', fixture417, 44],
    ])('page %s has %i', (_name, raw, count) => {
      expect(subpageCountOf(raw)).toBe(count);
    });

    it('takes the larger of subpagecount and the entries found', () => {
      const page = (p: object) => JSON.stringify({ teletext: { page: p } });
      expect(subpageCountOf(page({ subpagecount: '3', subpage: [{}, {}] }))).toBe(3);
      expect(subpageCountOf(page({ subpagecount: '1', subpage: [{}, {}] }))).toBe(2);
      expect(subpageCountOf(page({ subpage: { number: '1' } }))).toBe(1);
      expect(subpageCountOf(page({ subpagecount: 'x', subpage: [{}] }))).toBe(1);
    });

    it.each([
      ['not JSON', 'not json'],
      ['no page', '{"teletext":{}}'],
      ['no subpages', '{"teletext":{"page":{"number":"100"}}}'],
      ['a saved Yle 404 (112)', fixture112],
      ['null', 'null'],
    ])('is unknown for %s', (_name, raw) => {
      expect(subpageCountOf(raw)).toBeNull();
    });
  });

  it('subpage 1 goes to Yle even when the page is not stored', async () => {
    expect((await call('/v1/images/100/1.png')).status).toBe(200);
    expect(yleImageCalls()).toBe(1);
  });

  it('a higher subpage of a page that is not stored: 404, no call, not kept by browsers', async () => {
    const res = await call('/v1/images/100/2.png');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('once the page is stored, subpages up to its count go to Yle, higher ones do not', async () => {
    await call('/v1/pages/100.json');
    for (const sub of [2, 3, 4]) expect((await call(`/v1/images/100/${sub}.png`)).status).toBe(200);
    expect(yleImageCalls()).toBe(3);
    for (const sub of [5, 10, 99]) {
      expect((await call(`/v1/images/100/${sub}.png`)).status).toBe(404);
    }
    expect(yleImageCalls()).toBe(3);
  });

  it("another page's count does not count", async () => {
    await call('/v1/pages/100.json');
    expect((await call('/v1/images/101/2.png')).status).toBe(404);
    expect(yleImageCalls()).toBe(0);
  });

  it('uses the last good copy when the fresh one has expired, up to 24 h', async () => {
    await call('/v1/pages/100.json');
    advance(3600);
    expect((await call('/v1/images/100/3.png')).status).toBe(200);
    advance(23 * 3600);
    expect((await call('/v1/images/100/4.png')).status).toBe(404);
    expect(yleImageCalls()).toBe(1);
  });

  it('a stored page that is a 404 allows only subpage 1', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/pages/') ? new Response(YLE_404, { status: 404 }) : new Response(PNG),
    );
    await call('/v1/pages/150.json');
    expect((await call('/v1/images/150/2.png')).status).toBe(404);
    expect((await call('/v1/images/150/1.png')).status).toBe(200);
    expect(yleImageCalls()).toBe(1);
  });

  it('a picture already stored is served whatever the rule says', async () => {
    await call('/v1/pages/100.json');
    await call('/v1/images/100/4.png');
    // The page has left the store; its picture is still fresh.
    cache.store.delete('https://cache.satanen.internal/fresh/v1/pages/100.json');
    cache.store.delete('https://cache.satanen.internal/last-good/v1/pages/100.json');
    const res = await call('/v1/images/100/4.png');
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(yleImageCalls()).toBe(1);
  });

  it('a refused picture never shows the key', async () => {
    const res = await call('/v1/images/100/9.png', { headers: { Origin: 'https://satanen.io' } });
    const visible = await everythingVisible(res);
    for (const s of [APP_ID, APP_KEY, 'app_key', 'app_id']) expect(visible).not.toContain(s);
  });
});

/** One Worker copy's memory: its count, its failure pause and its requests in flight. */
function workerCopy() {
  const copy = {
    budget: new YleBudget(),
    pause: new YlePause(),
    inflight: new InFlight<YleOutcome>(),
    async call(path: string, init: RequestInit = {}) {
      const ctx = requestCtx();
      const res = await handle(new Request(`https://api.satanen.io${path}`, init), env, ctx, {
        cache,
        now: () => clock,
        budget: copy.budget,
        pause: copy.pause,
        inflight: copy.inflight,
      });
      await ctx.done();
      return res;
    },
  };
  return copy;
}

/** A Yle that answers only when the test says so. `answer(i, r)` settles the i-th request. */
function slowYle() {
  const settle: Array<(r: Response | Error) => void> = [];
  fetchMock.mockImplementation(
    () =>
      new Promise<Response>((resolve, reject) =>
        settle.push((r) => (r instanceof Error ? reject(r) : resolve(r))),
      ),
  );
  return {
    answer: (i: number, r: Response | Error) => settle[i](r),
    get asked() {
      return settle.length;
    },
  };
}

const neverAnswers = (_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

const secrets = [APP_ID, APP_KEY, 'app_key', 'app_id'];

describe('failure pause: Yle is not asked again at once after it fails (PUB.14)', () => {
  const advance = (s: number) => (clock += s * 1000);
  let w: ReturnType<typeof workerCopy>;
  beforeEach(() => {
    w = workerCopy();
  });

  it('the pauses are 60 s for 401/429 and 15 s for other failures', () => {
    expect(QUOTA_PAUSE_S).toBe(60);
    expect(ERROR_PAUSE_S).toBe(15);
  });

  describe.each([401, 429])('after Yle %i (the key or its quota)', (status) => {
    beforeEach(async () => {
      fetchMock.mockResolvedValue(new Response('no', { status }));
      expect((await w.call('/v1/pages/105.json')).status).toBe(502);
      fetchMock.mockClear();
      fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    });

    it('no page or picture is asked from Yle for 60 s: 503 busy with Retry-After', async () => {
      for (const path of ['/v1/pages/105.json', '/v1/pages/106.json', '/v1/images/107/1.png']) {
        const res = await w.call(path, { headers: { Origin: 'https://satanen.io' } });
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ error: 'busy' });
        expect(res.headers.get('Retry-After')).toBe('60');
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
      }
      advance(59.5);
      expect((await w.call('/v1/pages/106.json')).headers.get('Retry-After')).toBe('1');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(w.budget.used(clock)).toBe(1);
      expect(cache.puts).toEqual([]);
    });

    it('after 60 s Yle is asked again, and a success ends the pause', async () => {
      advance(60);
      expect((await w.call('/v1/pages/106.json')).status).toBe(200);
      expect((await w.call('/v1/pages/105.json')).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('HEAD gets the 503 too', async () => {
      expect((await w.call('/v1/pages/106.json', { method: 'HEAD' })).status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['500', () => fetchMock.mockResolvedValue(new Response('x', { status: 500 }))],
    ['503', () => fetchMock.mockResolvedValue(new Response('x', { status: 503 }))],
    ['a network error', () => fetchMock.mockRejectedValue(new TypeError('down'))],
    [
      'a redirect',
      () =>
        fetchMock.mockResolvedValue(
          new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/' } }),
        ),
    ],
  ])('after %s only that path waits, for 15 s', async (_name, breakYle) => {
    breakYle();
    expect((await w.call('/v1/pages/105.json')).status).toBe(502);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    const again = await w.call('/v1/pages/105.json');
    expect(again.status).toBe(503);
    expect(await again.json()).toEqual({ error: 'busy' });
    expect(again.headers.get('Retry-After')).toBe('15');
    expect(again.headers.get('Cache-Control')).toBe('no-store');
    // Other pages, and pictures of the same page, are asked as usual.
    expect((await w.call('/v1/pages/106.json')).status).toBe(200);
    expect((await w.call('/v1/images/105/1.png')).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    advance(14);
    expect((await w.call('/v1/pages/105.json')).status).toBe(503);
    advance(1);
    expect((await w.call('/v1/pages/105.json')).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The success removed the pause: nothing is kept for the path.
    expect(w.pause.size).toBe(0);
  });

  it('after a timeout only that path waits, for 15 s from when the timeout was seen', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(neverAnswers);
    const pending = w.call('/v1/pages/105.json');
    // The proxy's clock moves with the 8 s wait.
    advance(8);
    await vi.advanceTimersByTimeAsync(8001);
    expect((await pending).status).toBe(502);
    fetchMock.mockReset();
    advance(14);
    expect((await w.call('/v1/pages/105.json')).headers.get('Retry-After')).toBe('1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failure after the pause starts a new 15 s pause, not a longer one', async () => {
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }));
    await w.call('/v1/pages/105.json');
    advance(15);
    await w.call('/v1/pages/105.json');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await w.call('/v1/pages/105.json')).headers.get('Retry-After')).toBe('15');
    advance(15);
    await w.call('/v1/pages/105.json');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a Yle 404 is an answer, not a failure: no pause', async () => {
    fetchMock.mockResolvedValue(new Response(YLE_404, { status: 404 }));
    await w.call('/v1/pages/105.json');
    advance(30);
    expect((await w.call('/v1/pages/105.json')).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('during a pause, fresh copies are served as usual (cache hits are not affected)', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await w.call('/v1/pages/100.json');
    fetchMock.mockResolvedValue(new Response('quota', { status: 401 }));
    await w.call('/v1/pages/105.json');
    advance(10);
    const res = await w.call('/v1/pages/100.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('during a pause, an expired page gets its last good copy, with the browser time cap', async () => {
    // Page 301 (TV) is kept 30 min; the browser keeps it at most 2 min (FR.6).
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await w.call('/v1/pages/301.json');
    advance(1801);
    fetchMock.mockResolvedValue(new Response('slow down', { status: 429 }));
    await w.call('/v1/pages/105.json');
    fetchMock.mockClear();
    const res = await w.call('/v1/pages/301.json', { headers: { Origin: 'https://satanen.io' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Satanen-Cache')).toBe('STALE');
    expect(res.headers.get('X-Satanen-Stale')).toBe('1');
    expect(res.headers.get('X-Satanen-Ttl')).toBe('1800');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=120');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    expect(await res.text()).toBe(PAGE_JSON);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('during a pause, ?fresh=1 gets the copy it would have replaced', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await w.call('/v1/pages/134.json');
    advance(40);
    fetchMock.mockResolvedValue(new Response('quota', { status: 401 }));
    await w.call('/v1/pages/105.json');
    fetchMock.mockClear();
    const res = await w.call('/v1/pages/134.json?fresh=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a slow answer to a request sent before the 401 does not end the pause', async () => {
    const yle = slowYle();
    const early = w.call('/v1/pages/105.json');
    const quota = w.call('/v1/pages/106.json');
    await vi.waitFor(() => expect(yle.asked).toBe(2));
    yle.answer(1, new Response('quota', { status: 401 }));
    expect((await quota).status).toBe(502);
    advance(5);
    yle.answer(0, new Response(PAGE_JSON));
    expect((await early).status).toBe(200);
    // Still paused for every path.
    expect((await w.call('/v1/pages/107.json')).status).toBe(503);
    expect(yle.asked).toBe(2);
  });

  it('is per Worker copy: another copy (or a restart) asks Yle', async () => {
    fetchMock.mockResolvedValue(new Response('quota', { status: 401 }));
    await w.call('/v1/pages/105.json');
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    expect((await workerCopy().call('/v1/pages/105.json')).status).toBe(200);
  });

  it('with the hourly cap reached too, Retry-After is the longer wait', async () => {
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }));
    await w.call('/v1/pages/105.json');
    for (let i = 0; i < 250; i++) w.budget.record(clock);
    expect((await w.call('/v1/pages/105.json')).headers.get('Retry-After')).toBe('3600');
  });

  it('the paused 503 never shows the key, in the answer or the logs', async () => {
    fetchMock.mockResolvedValue(
      new Response(`denied ${APP_KEY}`, { status: 401, headers: { 'X-Echo': APP_ID } }),
    );
    const first = await w.call('/v1/pages/105.json', { headers: { Origin: 'https://satanen.io' } });
    const paused = await w.call('/v1/pages/106.json', {
      headers: { Origin: 'https://satanen.io' },
    });
    expect(paused.status).toBe(503);
    for (const res of [first, paused]) {
      const visible = await everythingVisible(res);
      for (const s of secrets) expect(visible).not.toContain(s);
    }
  });
});

describe('identical requests in flight share one Yle request (PUB.14)', () => {
  const advance = (s: number) => (clock += s * 1000);
  let w: ReturnType<typeof workerCopy>;
  let points: { blobs?: string[] }[];
  beforeEach(() => {
    w = workerCopy();
    points = [];
  });

  it('five readers of an expired page: one Yle request, counted once, the answer to all', async () => {
    const yle = slowYle();
    const pending = Array.from({ length: 5 }, () => w.call('/v1/pages/105.json'));
    await vi.waitFor(() => expect(w.inflight.size).toBe(1));
    expect(yle.asked).toBe(1);
    expect(w.budget.used(clock)).toBe(1);
    yle.answer(0, new Response(PAGE_JSON));
    const responses = await Promise.all(pending);
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Satanen-Cache')).toBe('MISS');
      expect(await res.text()).toBe(PAGE_JSON);
    }
    expect(yle.asked).toBe(1);
    expect(w.budget.used(clock)).toBe(1);
    expect(cache.puts).toHaveLength(2);
    expect(w.inflight.size).toBe(0);
  });

  it('the Yle request is in the stats once', async () => {
    const yle = slowYle();
    const analyticsEnv: Env = {
      ...env,
      ANALYTICS: { writeDataPoint: (p) => void points.push(p as { blobs?: string[] }) },
    };
    const req = () =>
      handle(new Request('https://api.satanen.io/v1/pages/105.json'), analyticsEnv, requestCtx(), {
        cache,
        now: () => clock,
        budget: w.budget,
        pause: w.pause,
        inflight: w.inflight,
      });
    const pending = [req(), req(), req()];
    await vi.waitFor(() => expect(yle.asked).toBe(1));
    yle.answer(0, new Response(PAGE_JSON));
    await Promise.all(pending);
    expect(points.filter((p) => p.blobs?.[0] === 'yle')).toHaveLength(1);
  });

  it('each reader gets its own CORS headers and HEAD gets no body', async () => {
    const yle = slowYle();
    const web = w.call('/v1/pages/105.json', { headers: { Origin: 'https://satanen.io' } });
    const app = w.call('/v1/pages/105.json');
    const head = w.call('/v1/pages/105.json', { method: 'HEAD' });
    await vi.waitFor(() => expect(yle.asked).toBe(1));
    yle.answer(0, new Response(PAGE_JSON));
    const [a, b, c] = await Promise.all([web, app, head]);
    expect(a.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    expect(b.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await a.text()).toBe(PAGE_JSON);
    expect(await b.text()).toBe(PAGE_JSON);
    expect(await c.text()).toBe('');
    expect(yle.asked).toBe(1);
  });

  it('pictures are shared too, each reader with the whole picture', async () => {
    const yle = slowYle();
    const pending = [w.call('/v1/images/105/1.png'), w.call('/v1/images/105/1.png')];
    await vi.waitFor(() => expect(yle.asked).toBe(1));
    yle.answer(0, new Response(PNG));
    for (const res of await Promise.all(pending)) {
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    }
  });

  it('different pages are not shared', async () => {
    const yle = slowYle();
    const pending = [w.call('/v1/pages/105.json'), w.call('/v1/pages/106.json')];
    await vi.waitFor(() => expect(yle.asked).toBe(2));
    yle.answer(0, new Response(PAGE_JSON));
    yle.answer(1, new Response(PAGE_JSON));
    await Promise.all(pending);
    expect(w.budget.used(clock)).toBe(2);
  });

  it.each([
    ['a Yle 503', () => new Response('x', { status: 503 })],
    ['a network error', () => new TypeError('down')],
  ])(
    '%s reaches every reader, and the next request may ask again after the pause',
    async (_n, failure) => {
      const yle = slowYle();
      const pending = Array.from({ length: 3 }, () => w.call('/v1/pages/105.json'));
      await vi.waitFor(() => expect(w.inflight.size).toBe(1));
      yle.answer(0, failure());
      for (const res of await Promise.all(pending)) {
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({ error: 'upstream' });
      }
      expect(yle.asked).toBe(1);
      expect(w.inflight.size).toBe(0);
      advance(15);
      const next = w.call('/v1/pages/105.json');
      await vi.waitFor(() => expect(yle.asked).toBe(2));
      yle.answer(1, new Response(PAGE_JSON));
      expect((await next).status).toBe(200);
    },
  );

  it('a failure gives every reader the last good copy when there is one', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await w.call('/v1/pages/105.json');
    advance(301);
    const yle = slowYle();
    const pending = [w.call('/v1/pages/105.json'), w.call('/v1/pages/105.json')];
    await vi.waitFor(() => expect(yle.asked).toBe(1));
    yle.answer(0, new Response('x', { status: 500 }));
    for (const res of await Promise.all(pending)) {
      expect(res.headers.get('X-Satanen-Cache')).toBe('STALE');
    }
  });

  it('a timeout reaches every reader, and nothing is left in memory', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(neverAnswers);
    const pending = [w.call('/v1/pages/105.json'), w.call('/v1/pages/105.json')];
    await vi.advanceTimersByTimeAsync(8001);
    for (const res of await Promise.all(pending)) expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(w.inflight.size).toBe(0);
  });

  it('?fresh=1 joins a plain miss for the same page (one cache entry, one request)', async () => {
    const OLD = '{"teletext":{"page":{"number":"134","v":"old"}}}';
    const NEW = '{"teletext":{"page":{"number":"134","v":"new"}}}';
    fetchMock.mockImplementationOnce(async () => new Response(OLD));
    await w.call('/v1/pages/134.json');
    // Past the 300 s limit: both are misses.
    advance(300);
    const yle = slowYle();
    const plain = w.call('/v1/pages/134.json');
    const fresh = w.call('/v1/pages/134.json?fresh=1');
    await vi.waitFor(() => expect(yle.asked).toBe(1));
    yle.answer(0, new Response(NEW));
    expect(await (await plain).text()).toBe(NEW);
    expect(await (await fresh).text()).toBe(NEW);
    expect(yle.asked).toBe(1);
  });

  it('two ?fresh=1 for the same page share one request', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(PAGE_JSON));
    await w.call('/v1/pages/134.json');
    advance(30);
    const yle = slowYle();
    const pending = [w.call('/v1/pages/134.json?fresh=1'), w.call('/v1/pages/134.json?fresh=1')];
    await vi.waitFor(() => expect(yle.asked).toBe(1));
    // A plain reader meanwhile gets the copy still inside its limit.
    expect((await w.call('/v1/pages/134.json')).headers.get('X-Satanen-Cache')).toBe('HIT');
    yle.answer(0, new Response(PAGE_JSON));
    for (const res of await Promise.all(pending)) {
      expect(res.headers.get('X-Satanen-Cache')).toBe('MISS');
    }
    expect(yle.asked).toBe(1);
  });

  it('near the hourly cap, a shared request counts once, so all readers get the page', async () => {
    for (let i = 0; i < 249; i++) w.budget.record(clock);
    const yle = slowYle();
    const pending = Array.from({ length: 5 }, () => w.call('/v1/pages/105.json'));
    await vi.waitFor(() => expect(w.inflight.size).toBe(1));
    expect(w.budget.used(clock)).toBe(250);
    // A different page now is past the cap.
    expect((await w.call('/v1/pages/106.json')).status).toBe(503);
    yle.answer(0, new Response(PAGE_JSON));
    for (const res of await Promise.all(pending)) expect(res.status).toBe(200);
    expect(yle.asked).toBe(1);
    expect(w.budget.used(clock)).toBe(250);
  });

  it('a request whose answer never comes is not joined after 10 s: the next reader asks Yle', async () => {
    const yle = slowYle();
    void w.call('/v1/pages/105.json');
    await vi.waitFor(() => expect(yle.asked).toBe(1));
    advance(10);
    const next = w.call('/v1/pages/105.json');
    await vi.waitFor(() => expect(yle.asked).toBe(2));
    yle.answer(1, new Response(PAGE_JSON));
    expect((await next).status).toBe(200);
  });

  it("the request that asked keeps Yle's answer alive for the others (waitUntil)", async () => {
    const yle = slowYle();
    const before = waiting.length;
    const pending = w.call('/v1/pages/105.json');
    await vi.waitFor(() => expect(yle.asked).toBe(1));
    expect(waiting.length).toBe(before + 1);
    yle.answer(0, new Response(PAGE_JSON));
    await pending;
  });

  it('leaves nothing in memory after many requests, answered or failed', async () => {
    let n = 0;
    fetchMock.mockImplementation(async () =>
      n++ % 2 ? new Response(PAGE_JSON) : new Response('x', { status: 500 }),
    );
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => w.call(`/v1/pages/${110 + (i % 20)}.json`)),
    );
    expect(w.inflight.size).toBe(0);
  });

  it('a shared failure never shows the key', async () => {
    const yle = slowYle();
    const pending = [
      w.call('/v1/pages/105.json', { headers: { Origin: 'https://satanen.io' } }),
      w.call('/v1/pages/105.json'),
    ];
    await vi.waitFor(() => expect(yle.asked).toBe(1));
    yle.answer(0, new Error(`https://external.api.yle.fi/x?app_id=${APP_ID}&app_key=${APP_KEY}`));
    for (const res of await Promise.all(pending)) {
      const visible = await everythingVisible(res);
      for (const s of secrets) expect(visible).not.toContain(s);
    }
  });
});

describe('redirects from Yle are never followed (PUB.14)', () => {
  const advance = (s: number) => (clock += s * 1000);

  it('asks fetch not to follow redirects', async () => {
    fetchMock.mockResolvedValue(new Response(PAGE_JSON));
    await call('/v1/pages/100.json');
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe('manual');
  });

  it.each([301, 302, 303, 307, 308])(
    'Yle %i is a failure: 502, nothing passed through, nothing stored',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('moved', {
          status,
          headers: { Location: `https://elsewhere.example/?app_key=${APP_KEY}` },
        }),
      );
      const res = await call('/v1/pages/100.json', { headers: { Origin: 'https://satanen.io' } });
      expect(res.status).toBe(502);
      expect(await res.clone().json()).toEqual({ error: 'upstream' });
      expect(res.headers.get('Location')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.puts).toEqual([]);
      const visible = await everythingVisible(res);
      for (const s of [...secrets, 'elsewhere']) expect(visible).not.toContain(s);
    },
  );

  it('a redirect serves the last good copy, like any failure', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE_JSON));
    await call('/v1/pages/100.json');
    advance(121);
    fetchMock.mockResolvedValue(new Response(null, { status: 301, headers: { Location: '/x' } }));
    const res = await call('/v1/pages/100.json');
    expect(res.headers.get('X-Satanen-Cache')).toBe('STALE');
    expect(await res.text()).toBe(PAGE_JSON);
  });
});
