import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyVisitor } from './analytics.ts';
import { handle, type CacheLike, type Env } from './index.ts';

const IP = '203.0.113.77';
const UA = 'Mozilla/5.0 (TestPhone) SatanenTest/1.0';
const SALT = 'test-salt-9d41c0e7';

interface Point {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
}

let points: Point[];
let fetchMock: ReturnType<typeof vi.fn>;
let waiting: Promise<unknown>[];
let clock: number;

const emptyCache: CacheLike = {
  match: async () => undefined,
  put: async () => undefined,
};
const ctx = { waitUntil: (p: Promise<unknown>) => void waiting.push(p) };

function makeEnv(extra: Partial<Env> = {}): Env {
  return {
    YLE_APP_ID: 'id-test',
    YLE_APP_KEY: 'key-test',
    // As in production (wrangler.toml); `npm run dev` adds localhost.
    ALLOWED_ORIGINS: 'https://satanen.io',
    ANALYTICS: { writeDataPoint: (p) => void points.push(p) },
    ANALYTICS_SALT: SALT,
    ...extra,
  };
}

async function open(
  path: string,
  headers: Record<string, string> = {},
  env: Env = makeEnv(),
  method = 'POST',
) {
  const request = new Request(`https://api.satanen.io${path}`, {
    method,
    headers: { 'CF-Connecting-IP': IP, 'User-Agent': UA, ...headers },
  });
  Object.defineProperty(request, 'cf', { value: { country: 'FI' } });
  const res = await handle(request, env, ctx, { cache: emptyCache, now: () => clock });
  await Promise.all(waiting);
  return res;
}

beforeEach(() => {
  points = [];
  waiting = [];
  clock = Date.parse('2026-10-24T12:00:00Z');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('counting opened pages', () => {
  it('writes one data point with page, country, platform and a daily visitor', async () => {
    const res = await open('/v1/opened/105', { Origin: 'https://satanen.io' });
    expect(res.status).toBe(204);
    expect(points).toHaveLength(1);
    const [point] = points;
    expect(point.blobs?.slice(0, 4)).toEqual(['open', '105', 'FI', 'web']);
    expect(point.blobs?.[4]).toMatch(/^[0-9a-f]{12}$/);
    expect(point.doubles).toEqual([1]);
    expect(point.indexes).toEqual(['105']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says app when there is no Origin header', async () => {
    await open('/v1/opened/300');
    expect(points[0].blobs?.[3]).toBe('app');
  });

  it('refuses a page opened from another website with 403 and does not count it (PUB.14)', async () => {
    const res = await open('/v1/opened/105', { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(points).toHaveLength(0);
  });

  it('answers the allowed web origin with CORS and nobody else', async () => {
    const ok = await open('/v1/opened/105', { Origin: 'https://satanen.io' });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://satanen.io');
    const other = await open('/v1/opened/105', { Origin: 'https://evil.example' });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(points).toHaveLength(1);
  });

  it('localhost is counted only where it is allowed (npm run dev), not in production', async () => {
    const prod = await open('/v1/opened/105', { Origin: 'http://localhost:8081' });
    expect(prod.status).toBe(403);
    expect(points).toHaveLength(0);
    const dev = await open(
      '/v1/opened/105',
      { Origin: 'http://localhost:8081' },
      makeEnv({ ALLOWED_ORIGINS: 'https://satanen.io,http://localhost:8081' }),
    );
    expect(dev.status).toBe(204);
    expect(dev.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    expect(points).toHaveLength(1);
    expect(points[0].blobs?.[3]).toBe('web');
  });

  it.each(['/v1/opened/99', '/v1/opened/900', '/v1/opened/abc', '/v1/opened/0105', '/v1/opened/'])(
    'rejects %s and counts nothing',
    async (path) => {
      const res = await open(path);
      expect(res.status).toBe(405); // like any POST to a path that takes none
      expect(points).toHaveLength(0);
    },
  );

  it('accepts only POST on the route', async () => {
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
      const res = await open('/v1/opened/105', {}, makeEnv(), method);
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('POST, OPTIONS');
    }
    expect(points).toHaveLength(0);
  });

  it('answers the preflight for POST without counting', async () => {
    const res = await open(
      '/v1/opened/105',
      { Origin: 'https://satanen.io' },
      makeEnv(),
      'OPTIONS',
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(points).toHaveLength(0);
  });

  it('answers 204 and counts nothing when analytics is not set up', async () => {
    const noBinding = makeEnv({ ANALYTICS: undefined });
    expect((await open('/v1/opened/105', {}, noBinding)).status).toBe(204);
    const noSalt = makeEnv({ ANALYTICS_SALT: undefined });
    expect((await open('/v1/opened/105', {}, noSalt)).status).toBe(204);
    expect(points).toHaveLength(0);
  });

  it('answers 204 even when writing the data point fails', async () => {
    const broken = makeEnv({
      ANALYTICS: {
        writeDataPoint: () => {
          throw new Error(`boom ${IP}`);
        },
      },
    });
    const res = await open('/v1/opened/105', {}, broken);
    expect(res.status).toBe(204);
  });

  it('never stores or returns the IP address, the browser string, a cookie or a bare hash input', async () => {
    const res = await open('/v1/opened/105', { Origin: 'https://satanen.io' });
    const everything = [
      JSON.stringify(points),
      [...res.headers].map(([k, v]) => `${k}: ${v}`).join('\n'),
      await res.text(),
    ].join('\n');
    expect(everything).not.toContain(IP);
    expect(everything).not.toContain(UA);
    expect(everything).not.toContain('SatanenTest');
    expect(everything).not.toContain(SALT);
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('the daily visitor hash', () => {
  it('is the same for the same reader on the same day', async () => {
    await open('/v1/opened/105');
    await open('/v1/opened/201');
    expect(points[0].blobs?.[4]).toBe(points[1].blobs?.[4]);
  });

  it('changes the next day', async () => {
    await open('/v1/opened/105');
    clock += 24 * 60 * 60 * 1000;
    await open('/v1/opened/105');
    expect(points[0].blobs?.[4]).not.toBe(points[1].blobs?.[4]);
  });

  it('changes with the IP address and with the browser', async () => {
    await open('/v1/opened/105');
    await open('/v1/opened/105', { 'CF-Connecting-IP': '203.0.113.78' });
    await open('/v1/opened/105', { 'User-Agent': 'Other/1.0' });
    const visitors = points.map((p) => p.blobs?.[4]);
    expect(new Set(visitors).size).toBe(3);
  });

  it('changes with the secret', async () => {
    const a = await dailyVisitor('secret-a', '2026-10-24', IP, UA);
    const b = await dailyVisitor('secret-b', '2026-10-24', IP, UA);
    expect(a).not.toBe(b);
  });
});

describe('counting requests to Yle', () => {
  it('writes one data point per request sent to Yle, with its outcome and nothing else', async () => {
    fetchMock.mockResolvedValue(new Response('{"teletext":{"page":{"number":"100"}}}'));
    const request = new Request('https://api.satanen.io/v1/pages/100.json', {
      headers: { 'CF-Connecting-IP': IP, 'User-Agent': UA },
    });
    await handle(request, makeEnv(), ctx, { cache: emptyCache, now: () => clock });
    await Promise.all(waiting);
    expect(points).toEqual([
      { blobs: ['yle', 'p100', 'ok', 'XXX'], doubles: [1], indexes: ['yle'] },
    ]);
    expect(JSON.stringify(points)).not.toContain(IP);
    expect(JSON.stringify(points)).not.toContain('key-test');
  });

  it.each([
    [404, 'not-found'],
    [401, 'status-401'],
    [500, 'status-500'],
  ])('records a Yle %i as %s', async (status, outcome) => {
    fetchMock.mockResolvedValue(new Response('x', { status }));
    const request = new Request('https://api.satanen.io/v1/images/201/1.png');
    await handle(request, makeEnv(), ctx, { cache: emptyCache, now: () => clock });
    expect(points[0].blobs).toEqual(['yle', 'i201', outcome, 'XXX']);
  });

  it('adds the data centre as a new last field, after the existing ones', async () => {
    fetchMock.mockResolvedValue(new Response('{"teletext":{"page":{"number":"221"}}}'));
    const request = new Request('https://api.satanen.io/v1/pages/221.json');
    Object.defineProperty(request, 'cf', { value: { colo: 'ARN', country: 'FI' } });
    await handle(request, makeEnv(), ctx, { cache: emptyCache, now: () => clock });
    // Positions 1-3 are what stats.ts has always read; the data centre is blob4.
    expect(points[0].blobs).toEqual(['yle', 'p221', 'ok', 'ARN']);
  });

  it.each([
    [{ colo: 'arn' }, 'XXX'],
    [{ colo: 'ARNX' }, 'XXX'],
    [{ colo: 7 }, 'XXX'],
    [{}, 'XXX'],
  ])('writes XXX for a data centre it does not recognise (%o)', async (cf, expected) => {
    fetchMock.mockResolvedValue(new Response('{}'));
    const request = new Request('https://api.satanen.io/v1/pages/100.json');
    Object.defineProperty(request, 'cf', { value: cf });
    await handle(request, makeEnv(), ctx, { cache: emptyCache, now: () => clock });
    expect(points[0].blobs?.[3]).toBe(expected);
  });

  it('records a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    const request = new Request('https://api.satanen.io/v1/pages/100.json');
    await handle(request, makeEnv(), ctx, { cache: emptyCache, now: () => clock });
    expect(points[0].blobs).toEqual(['yle', 'p100', 'failed', 'XXX']);
  });

  it('writes nothing for an answer from the cache', async () => {
    const stored = new Response('{"teletext":{"page":{"number":"100"}}}', {
      headers: { 'X-Satanen-Fetched-At': new Date(clock).toISOString() },
    });
    const cache: CacheLike = { match: async () => stored.clone(), put: async () => undefined };
    const request = new Request('https://api.satanen.io/v1/pages/100.json');
    const res = await handle(request, makeEnv(), ctx, { cache, now: () => clock });
    expect(res.headers.get('X-Satanen-Cache')).toBe('HIT');
    expect(points).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still answers when analytics is missing or broken', async () => {
    fetchMock.mockResolvedValue(new Response('{"teletext":{}}'));
    const broken = makeEnv({
      ANALYTICS: {
        writeDataPoint: () => {
          throw new Error('boom');
        },
      },
    });
    const request = new Request('https://api.satanen.io/v1/pages/100.json');
    const res = await handle(request, broken, ctx, { cache: emptyCache, now: () => clock });
    expect(res.status).toBe(200);
  });
});
