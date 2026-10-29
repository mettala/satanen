import { coloOf, recordOpen, recordYle, type AnalyticsEnv } from './analytics.ts';
import { browserMaxAge, limitFor, YleBudget } from './ttl.ts';
import { failureOf, InFlight, YlePause } from './upstream.ts';

export interface Env extends AnalyticsEnv {
  YLE_APP_ID: string;
  YLE_APP_KEY: string;
  /** Comma-separated list of origins the browser may read from. */
  ALLOWED_ORIGINS: string;
}

const YLE_BASE = 'https://external.api.yle.fi/v1/teletext';
const UPSTREAM_TIMEOUT_MS = 8000;

// Edge cache: one limit per kind of page (D39 B, see ttl.ts), plus a last good
// copy kept 24 h for when Yle fails (D11).
const LAST_GOOD_TTL_S = 24 * 60 * 60;

/**
 * `?fresh=1` on a page (D39 C, FR.4): the app saw a list headline that its
 * article doesn't match, and asks for a newer copy. Honoured only when the
 * stored copy is at least this old (judged from its stored
 * X-Satanen-Fetched-At, so every Worker copy in the data centre agrees) and
 * Yle's hourly count isn't running high. So one page costs Yle at most one
 * extra request per 30 s per data centre, however many readers ask.
 * A query parameter, not a `Cache-Control: no-cache` request header: that
 * header would make browsers send a CORS preflight first.
 * Not exported: the Workers runtime refuses to start a main module that
 * exports anything but functions and the handler (a test checks this).
 */
const FRESH_MIN_AGE_S = 30;

/** This Worker copy's Yle count for the hour (in memory, best effort; see ttl.ts). */
const budget = new YleBudget();
/** This Worker copy's memory of recent Yle failures, and its Yle requests in flight (see upstream.ts). */
const pause = new YlePause();
const inflight = new InFlight<YleOutcome>();

/** The parts of the Workers Cache API we use; tests pass a fake. */
export interface CacheLike {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
}

export interface Deps {
  cache: CacheLike;
  /** Milliseconds since epoch. */
  now: () => number;
  /** Counts Yle requests this hour; when missing, a new one per request (nothing is doubled). */
  budget?: YleBudget;
  /** Recent Yle failures (PUB.14); when missing, a new one per request (nothing is paused). */
  pause?: YlePause;
  /** Yle requests in flight, shared by identical requests (PUB.14); when missing, nothing is shared. */
  inflight?: InFlight<YleOutcome>;
}

export interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

// Page 100-899. Image sub-page 1-99. No leading zeros.
const PAGE_ROUTE = /^\/v1\/pages\/([1-8]\d\d)\.json$/;
const IMAGE_ROUTE = /^\/v1\/images\/([1-8]\d\d)\/([1-9]\d?)\.png$/;
// The app tells us a reader opened a page (D32). POST, no body, no custom headers: a "simple" request, so no preflight.
const OPENED_ROUTE = /^\/v1\/opened\/([1-8]\d\d)$/;

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Expose-Headers'] =
      'X-Satanen-Cache, X-Satanen-Stale, X-Satanen-Fetched-At, X-Satanen-Ttl';
  }
  return headers;
}

function jsonError(status: number, error: string, extra: Record<string, string>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

async function fetchFromYle(
  path: string,
  env: Env,
  accept: string,
): Promise<Response | 'timeout' | 'failed'> {
  const url = `${YLE_BASE}${path}?app_id=${encodeURIComponent(env.YLE_APP_ID)}&app_key=${encodeURIComponent(env.YLE_APP_KEY)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    // `manual`: a redirect is never followed (it could send the key's URL on,
    // or pass another server's answer off as Yle's). Any 3xx is a failure.
    return await fetch(url, {
      headers: { Accept: accept },
      signal: controller.signal,
      redirect: 'manual',
    });
  } catch (e) {
    // Never log the error object or the URL: either could contain the key.
    return (e as { name?: string })?.name === 'AbortError' ? 'timeout' : 'failed';
  } finally {
    clearTimeout(timer);
  }
}

interface Stored {
  status: 200 | 404;
  body: ArrayBuffer;
  contentType: string;
  fetchedAt: number;
}

/** What one Yle request gave, shared by every request that waited for it. */
export type YleOutcome = { ok: true; stored: Stored } | { ok: false };

// Cache keys use the path only: query strings (`?fresh=1` too) and headers are ignored.
function cacheKey(kind: 'fresh' | 'last-good', pathname: string): Request {
  return new Request(`https://cache.satanen.internal/${kind}${pathname}`);
}

/** The stored copy, if it is younger than `maxAgeS` (which may depend on whether it is a 404). */
async function readStored(
  cache: CacheLike,
  key: Request,
  maxAgeS: (status: 200 | 404) => number,
  now: number,
): Promise<Stored | null> {
  const hit = await cache.match(key);
  if (!hit) return null;
  const status = hit.status === 404 ? 404 : 200;
  const fetchedAt = Date.parse(hit.headers.get('X-Satanen-Fetched-At') ?? '');
  if (Number.isNaN(fetchedAt) || now - fetchedAt >= maxAgeS(status) * 1000) return null;
  return {
    status,
    body: await hit.arrayBuffer(),
    contentType: hit.headers.get('Content-Type') ?? 'application/octet-stream',
    fetchedAt,
  };
}

/**
 * How many subpages a page has, from Yle's page JSON (as text), or null when
 * the text isn't a page. The larger of Yle's `subpagecount` and the number of
 * `subpage` entries, as the app draws one picture per subpage it finds
 * (src/ui/reader/plan.ts). Only read, never changed (D10).
 */
export function subpageCountOf(json: string): number | null {
  try {
    const page = (JSON.parse(json) as { teletext?: { page?: unknown } })?.teletext?.page;
    if (!page || typeof page !== 'object') return null;
    const { subpagecount, subpage } = page as { subpagecount?: unknown; subpage?: unknown };
    const declared = Number(subpagecount);
    const found = Array.isArray(subpage) ? subpage.length : subpage ? 1 : 0;
    const count = Math.max(Number.isInteger(declared) ? declared : 0, found);
    return count > 0 ? count : null;
  } catch {
    return null;
  }
}

/**
 * Image route rule (PUB.6, D39 amendment): may `/v1/images/{page}/{sub}` go
 * to Yle? Only if `sub` is a subpage the page is known to have. The count
 * comes from the page JSON this data centre stored (the fresh copy if it is a
 * page, else the last good copy, kept 24 h). If the page isn't stored, only
 * subpage 1 may go: the app always loads the page JSON before it asks for a
 * picture, so a real reader's page is stored. This shrinks what a script can
 * ask Yle for from 99 pictures per page to the ones that exist.
 */
async function imageSubAllowed(
  cache: CacheLike,
  page: string,
  sub: number,
  now: number,
): Promise<boolean> {
  if (sub === 1) return true;
  const path = `/v1/pages/${page}.json`;
  const anyAge = () => LAST_GOOD_TTL_S;
  let stored = await readStored(cache, cacheKey('fresh', path), anyAge, now);
  if (stored?.status !== 200) {
    stored = await readStored(cache, cacheKey('last-good', path), anyAge, now);
  }
  if (!stored || stored.status !== 200) return false;
  const count = subpageCountOf(new TextDecoder().decode(stored.body));
  return count !== null && sub <= count;
}

function toStoredResponse(s: Stored, ttlS: number): Response {
  return new Response(s.body, {
    status: s.status,
    headers: {
      'Content-Type': s.contentType,
      'Cache-Control': `public, max-age=${ttlS}`,
      'X-Satanen-Fetched-At': new Date(s.fetchedAt).toISOString(),
    },
  });
}

/**
 * `ttlS` is the page's limit right now (doubled when Yle's hourly count runs
 * high). The app reads it from `X-Satanen-Ttl`; the browser gets a quarter.
 */
function toClientResponse(
  s: Stored,
  cacheState: 'HIT' | 'MISS' | 'STALE',
  ttlS: number,
  isHead: boolean,
  cors: Record<string, string>,
): Response {
  const headers: Record<string, string> = {
    'Content-Type': s.contentType,
    'Cache-Control': `public, max-age=${browserMaxAge(ttlS)}`,
    'X-Satanen-Cache': cacheState,
    'X-Satanen-Fetched-At': new Date(s.fetchedAt).toISOString(),
    'X-Satanen-Ttl': String(ttlS),
    ...cors,
  };
  if (cacheState === 'STALE') headers['X-Satanen-Stale'] = '1';
  return new Response(isHead ? null : s.body, { status: s.status, headers });
}

function noStore(res: Response): Response {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** Every response, errors and preflights included, says "do not guess the content type". */
export async function handle(request: Request, env: Env, ctx: Ctx, deps: Deps): Promise<Response> {
  const res = await route(request, env, ctx, deps);
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function route(request: Request, env: Env, ctx: Ctx, deps: Deps): Promise<Response> {
  // A browser on another website (PUB.14): refused before the cache, Yle or
  // the page counts are touched, so it costs Yle nothing. Only browsers send
  // `Origin`; the app, `<img>` tags and scripts send none and are not
  // affected (the limits in "Protecting the key" in README.md cover them).
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins(env).includes(origin)) {
    return jsonError(403, 'forbidden', { Vary: 'Origin', 'Cache-Control': 'no-store' });
  }

  const cors = corsHeaders(request, env);
  const { method } = request;

  const { pathname, searchParams } = new URL(request.url);
  const openedMatch = OPENED_ROUTE.exec(pathname);

  if (openedMatch && method === 'POST') {
    // No Origin (the Android app) or an allowed one: opens from another website got the 403 above.
    ctx.waitUntil(recordOpen(env, request, openedMatch[1], deps.now()));
    return new Response(null, { status: 204, headers: { ...cors, 'Cache-Control': 'no-store' } });
  }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    return jsonError(405, 'method-not-allowed', {
      ...cors,
      Allow: openedMatch ? 'POST, OPTIONS' : 'GET, HEAD, OPTIONS',
    });
  }

  const pageMatch = PAGE_ROUTE.exec(pathname);
  const imageMatch = pageMatch ? null : IMAGE_ROUTE.exec(pathname);
  if (!pageMatch && !imageMatch && !openedMatch) return jsonError(404, 'not-found', cors);

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'Access-Control-Allow-Methods': openedMatch ? 'POST, OPTIONS' : 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (openedMatch) return jsonError(405, 'method-not-allowed', { ...cors, Allow: 'POST, OPTIONS' });

  const isHead = method === 'HEAD';
  const { cache } = deps;
  const yleBudget = deps.budget ?? new YleBudget();
  const freshKey = cacheKey('fresh', pathname);
  const lastGoodKey = cacheKey('last-good', pathname);
  // An image has the limit of its page (see ttl.ts).
  const page = Number((pageMatch ?? imageMatch)![1]);
  /** The limit now: the page kind's, doubled while this hour's Yle count is high. */
  const ttlNow = (status: 200 | 404) =>
    limitFor(page, status).limitS * yleBudget.factor(deps.now());
  /**
   * How long Cloudflare may hold a fresh copy: the longest the limit can get
   * (doubled), so a copy stored before the doubling is still there after it.
   * Whether it is still fresh is decided by `ttlNow` when it is read.
   */
  const keepS = (status: 200 | 404) => limitFor(page, status).limitS * 2;

  const fresh = await readStored(cache, freshKey, ttlNow, deps.now());
  // Pages only: `fresh` on an image (or anything else) is ignored.
  const askAgain =
    fresh !== null &&
    pageMatch !== null &&
    searchParams.get('fresh') === '1' &&
    deps.now() - fresh.fetchedAt >= FRESH_MIN_AGE_S * 1000 &&
    yleBudget.factor(deps.now()) === 1 &&
    !yleBudget.full(deps.now());
  if (fresh && !askAgain) return toClientResponse(fresh, 'HIT', ttlNow(fresh.status), isHead, cors);

  if (!env.YLE_APP_ID || !env.YLE_APP_KEY) {
    console.error('proxy: Yle credentials are not configured');
    return noStore(jsonError(500, 'server', cors));
  }

  // A picture of a subpage the page isn't known to have: not asked from Yle.
  if (
    imageMatch &&
    !(await imageSubAllowed(cache, imageMatch[1], Number(imageMatch[2]), deps.now()))
  ) {
    return noStore(jsonError(404, 'not-found', cors));
  }

  /** Yle wasn't asked or failed: the copy `?fresh=1` skipped, else the last good copy, else `error`. */
  const fallback = async (error: () => Response): Promise<Response> => {
    // A `fresh` request: the copy we skipped is still inside its limit.
    if (fresh) return toClientResponse(fresh, 'HIT', ttlNow(fresh.status), isHead, cors);
    const stale = await readStored(cache, lastGoodKey, () => LAST_GOOD_TTL_S, deps.now());
    if (stale) return toClientResponse(stale, 'STALE', ttlNow(200), isHead, cors);
    return noStore(error());
  };

  const yleInFlight = deps.inflight ?? new InFlight<YleOutcome>();
  const ylePause = deps.pause ?? new YlePause();

  // From here to `yleInFlight.run` there is no `await`: the checks and the
  // count happen together, so requests arriving while Yle is slow (up to 8 s)
  // see this one, and a burst can't slip past the cap or the pause.
  // The key is the path, like the cache key: `?fresh=1` and a plain miss for
  // the same page share one request, as either one's answer is newer than
  // the stored copy and replaces it (see README.md).
  const now = deps.now();
  let pending = yleInFlight.get(pathname, now);
  if (!pending) {
    // A recent failure (upstream.ts) or the hour's hard cap (YLE_HOURLY_CAP
    // in ttl.ts): Yle is not asked at all.
    const pauseS = ylePause.waitS(pathname, now);
    const full = yleBudget.full(now);
    if (pauseS > 0 || full) {
      const retryS = Math.max(pauseS, full ? yleBudget.secondsToNextHour(now) : 0);
      return fallback(() => jsonError(503, 'busy', { ...cors, 'Retry-After': String(retryS) }));
    }
    // Counted once per Yle request, before sending it; failed and timed-out
    // requests count too. Requests that join it below are not counted.
    yleBudget.record(now);
    pending = yleInFlight.run(pathname, now, () =>
      askYle().catch((): YleOutcome => ({ ok: false })),
    );
    // Others may be waiting for this answer: it finishes even if this reader leaves.
    ctx.waitUntil(pending);
  }
  const outcome = await pending;
  if (!outcome.ok) return fallback(() => jsonError(502, 'upstream', cors));
  // Each waiter gets its own copy of the body.
  const stored: Stored = { ...outcome.stored, body: outcome.stored.body.slice(0) };
  return toClientResponse(stored, 'MISS', ttlNow(stored.status), isHead, cors);

  /**
   * One request to Yle, shared by every request that waits for it. Stores the
   * answer and remembers a failure. Never throws: a failure is an outcome.
   */
  async function askYle(): Promise<YleOutcome> {
    const upstreamPath = pageMatch
      ? `/pages/${pageMatch[1]}.json`
      : `/images/${imageMatch![1]}/${imageMatch![2]}.png`;
    const upstream = await fetchFromYle(
      upstreamPath,
      env,
      pageMatch ? 'application/json' : 'image/png',
    );
    const code = typeof upstream === 'string' ? upstream : upstream.status;

    recordYle(
      env,
      pageMatch ? `p${pageMatch[1]}` : `i${imageMatch![1]}`,
      code === 200
        ? 'ok'
        : code === 404
          ? 'not-found'
          : typeof code === 'string'
            ? code
            : `status-${code}`,
      coloOf(request),
    );

    let failure = failureOf(code);
    let body: ArrayBuffer | null = null;
    if (!failure && code === 200) {
      try {
        body = await (upstream as Response).arrayBuffer();
      } catch {
        // Yle's answer broke off half-way.
        failure = 'error';
      }
    }
    if (typeof upstream !== 'string' && body === null) {
      // Not read (an error, a redirect or a 404): let the connection go.
      upstream.body?.cancel().catch(() => {});
    }
    if (failure) {
      // Never log the response or the URL: either could contain the key.
      console.error(`proxy: upstream ${typeof code === 'string' ? code : `status ${code}`}`);
      ylePause.failed(pathname, failure, deps.now());
      return { ok: false };
    }
    ylePause.succeeded(pathname);

    const fetchedAt = deps.now();
    if (body === null) {
      // Yle 404: Yle answers missing pages with XML; we answer with JSON.
      const notFound: Stored = {
        status: 404,
        body: new TextEncoder().encode(JSON.stringify({ error: 'not-found' }))
          .buffer as ArrayBuffer,
        contentType: 'application/json; charset=utf-8',
        fetchedAt,
      };
      ctx.waitUntil(cache.put(freshKey, toStoredResponse(notFound, keepS(404))));
      return { ok: true, stored: notFound };
    }

    const found: Stored = {
      status: 200,
      body,
      contentType: pageMatch ? 'application/json; charset=utf-8' : 'image/png',
      fetchedAt,
    };
    ctx.waitUntil(
      Promise.all([
        cache.put(freshKey, toStoredResponse(found, keepS(200))),
        cache.put(lastGoodKey, toStoredResponse(found, LAST_GOOD_TTL_S)),
      ]),
    );
    return { ok: true, stored: found };
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handle(request, env, ctx, {
      cache: (caches as unknown as { default: CacheLike }).default,
      now: Date.now,
      budget,
      pause,
      inflight,
    });
  },
} satisfies ExportedHandler<Env>;
