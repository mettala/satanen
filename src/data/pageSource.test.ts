import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStorageBackend } from '../storage/store';
import { createMemoryBackend } from '../storage/testing';
import { loadSavedPage, resetPageCacheMemory, savedPageKey, type SavedPage } from './pageCache';
import { FRESH_CAP_MS, PAGE_LIMIT_MS, refetchesOnTimer, RETRY_AFTER_FAIL_MS } from './freshness';
import {
  createPageSource,
  isUpdatingDeviceCopy,
  MAX_IN_MEMORY,
  type PageSourceOptions,
} from './pageSource';

// Fake fetch (the real getPage runs on top of it), fake storage, fake clock.

const raw = (n: number) => readFileSync(join(__dirname, `../../fixtures/pages/${n}.json`), 'utf8');
const SAVED_AT = '2026-10-21T09:00:00.000Z';
const PROXY_AT = '2026-10-22T11:32:00.000Z';

function ok(n: number, headers: Record<string, string> = {}) {
  return new Response(raw(n), { status: 200, headers });
}
function status(code: number) {
  return new Response('{"error":"x"}', { status: code });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Lets pending promises and storage reads finish. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const fetchMock = vi.fn();
let clock = 0;
let backend: ReturnType<typeof createMemoryBackend>;

function saved(n: number, fetchedAt = SAVED_AT, body = raw(n)) {
  backend.data.set(savedPageKey(n), `{"fetchedAt":"${fetchedAt}","raw":${body}}`);
}

function source(options: PageSourceOptions = {}) {
  return createPageSource({ now: () => clock, ...options });
}

/** Subscribes to page `n` and records every state it goes through. */
function watch(src: ReturnType<typeof source>, n: number) {
  const seen = [src.getSnapshot(n)];
  const off = src.subscribe(n, () => seen.push(src.getSnapshot(n)));
  return { seen, off, now: () => src.getSnapshot(n) };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('EXPO_PUBLIC_PROXY_URL', 'http://proxy.test');
  backend = createMemoryBackend();
  setStorageBackend(backend);
  resetPageCacheMemory();
  clock = Date.parse('2026-10-22T12:00:00.000Z');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('first visit, no copy on the device', () => {
  it('goes from loading to ready and saves a copy', async () => {
    fetchMock.mockResolvedValue(ok(105, { 'X-Satanen-Fetched-At': PROXY_AT }));
    const w = watch(source(), 105);
    expect(w.now().status).toBe('loading');
    await settle();
    const s = w.now();
    expect(s.status).toBe('ready');
    expect(s.page?.number).toBe(105);
    expect(s.updatedAt?.toISOString()).toBe(PROXY_AT);
    expect(s).toMatchObject({ offline: false, stale: false, reason: null, refreshing: false });
    expect(w.seen.map((x) => x.status)).not.toContain('error');

    const copy = await loadSavedPage(105);
    expect(copy?.fetchedAt.toISOString()).toBe(PROXY_AT);
    expect(copy?.raw).toEqual(JSON.parse(raw(105)));
  });

  it('uses the device clock when the proxy sends no fetch time', async () => {
    fetchMock.mockResolvedValue(ok(105));
    const w = watch(source(), 105);
    await settle();
    expect(w.now().updatedAt?.getTime()).toBe(clock);
  });

  it('passes on the proxy stale flag', async () => {
    fetchMock.mockResolvedValue(ok(105, { 'X-Satanen-Stale': '1' }));
    const w = watch(source(), 105);
    await settle();
    expect(w.now()).toMatchObject({ status: 'ready', stale: true, offline: false });
  });

  it.each([
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['upstream', () => Promise.resolve(status(502))],
    ['not-found', () => Promise.resolve(status(404))],
    ['bad-data', () => Promise.resolve(new Response('<html>'))],
  ] as const)('network fails (%s) → error with that reason', async (reason, reply) => {
    fetchMock.mockImplementation(reply);
    const w = watch(source(), 105);
    await settle();
    expect(w.now()).toMatchObject({ status: 'error', reason, page: null, offline: false });
  });

  it('an invalid page number is not-found without a request', async () => {
    const w = watch(source(), 42);
    await settle();
    expect(w.now()).toMatchObject({ status: 'error', reason: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('with a copy on the device', () => {
  it('shows the copy at once, then the fresh page', async () => {
    saved(105);
    const reply = deferred<Response>();
    fetchMock.mockReturnValue(reply.promise);
    const w = watch(source(), 105);
    await settle();
    expect(w.now()).toMatchObject({ status: 'ready', offline: false, refreshing: true });
    expect(w.now().updatedAt?.toISOString()).toBe(SAVED_AT);
    expect(w.now().page?.number).toBe(105);

    reply.resolve(ok(105, { 'X-Satanen-Fetched-At': PROXY_AT }));
    await settle();
    expect(w.now()).toMatchObject({ status: 'ready', offline: false, refreshing: false });
    expect(w.now().updatedAt?.toISOString()).toBe(PROXY_AT);
    expect(w.seen.map((x) => x.status)).toEqual(['loading', 'loading', 'ready', 'ready']);
  });

  it.each([
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['upstream', () => Promise.resolve(status(503))],
    ['bad-data', () => Promise.resolve(new Response('{"hello":1}'))],
  ] as const)('network fails (%s) → the copy, marked offline', async (reason, reply) => {
    saved(105);
    fetchMock.mockImplementation(reply);
    const w = watch(source(), 105);
    await settle();
    expect(w.now()).toMatchObject({ status: 'ready', offline: true, reason, refreshing: false });
    expect(w.now().page?.number).toBe(105);
    expect(w.now().updatedAt?.toISOString()).toBe(SAVED_AT);
  });

  it('a page gone from Teksti-TV (404) is an error, not an old copy', async () => {
    saved(105);
    fetchMock.mockResolvedValue(status(404));
    const w = watch(source(), 105);
    await settle();
    expect(w.now()).toMatchObject({ status: 'error', reason: 'not-found', page: null });
  });

  it('keeps the copy offline when the network fails before storage answers', async () => {
    const slow = deferred<SavedPage | null>();
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const w = watch(source({ loadSaved: () => slow.promise }), 105);
    await settle();
    expect(w.now().status).toBe('loading');
    slow.resolve({ raw: JSON.parse(raw(105)), fetchedAt: new Date(SAVED_AT) });
    await settle();
    expect(w.now()).toMatchObject({ status: 'ready', offline: true, reason: 'offline' });
  });

  it('does not let a slow device copy replace a fresh page', async () => {
    const slow = deferred<SavedPage | null>();
    fetchMock.mockResolvedValue(ok(105, { 'X-Satanen-Fetched-At': PROXY_AT }));
    const w = watch(source({ loadSaved: () => slow.promise }), 105);
    await settle();
    slow.resolve({ raw: JSON.parse(raw(105)), fetchedAt: new Date(SAVED_AT) });
    await settle();
    expect(w.now().updatedAt?.toISOString()).toBe(PROXY_AT);
  });

  it('ignores a damaged copy or a copy of another page', async () => {
    saved(105, SAVED_AT, '{"not":"a page"}');
    saved(106, SAVED_AT, raw(105));
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const src = source();
    const a = watch(src, 105);
    const b = watch(src, 106);
    await settle();
    expect(a.now()).toMatchObject({ status: 'error', reason: 'offline' });
    expect(b.now()).toMatchObject({ status: 'error', reason: 'offline' });
  });

  it('works without any storage', async () => {
    setStorageBackend(null);
    fetchMock.mockResolvedValue(ok(105));
    const w = watch(source(), 105);
    await settle();
    expect(w.now().status).toBe('ready');
  });

  it('a saved copy still opens after an app restart', async () => {
    fetchMock.mockResolvedValue(ok(105, { 'X-Satanen-Fetched-At': PROXY_AT }));
    watch(source(), 105);
    await settle();
    await settle();
    expect(backend.data.has(savedPageKey(105))).toBe(true);

    // New app start, no connection.
    resetPageCacheMemory();
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const w = watch(source(), 105);
    await settle();
    expect(w.now()).toMatchObject({ status: 'ready', offline: true });
    expect(w.now().updatedAt?.toISOString()).toBe(PROXY_AT);
  });
});

describe('sharing between screens', () => {
  it('two screens opening the same page make one request', async () => {
    const reply = deferred<Response>();
    fetchMock.mockReturnValue(reply.promise);
    const src = source();
    const a = watch(src, 105);
    const b = watch(src, 105);
    reply.resolve(ok(105));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.now()).toBe(b.now());
    expect(a.now().status).toBe('ready');
  });

  it('different pages make their own requests', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(ok(url.includes('105') ? 105 : 100)),
    );
    const src = source();
    const a = watch(src, 105);
    const b = watch(src, 100);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(a.now().page?.number).toBe(105);
    expect(b.now().page?.number).toBe(100);
  });

  it('a page is not fetched again within the cap (60 s); later it is', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok(105)));
    const src = source();
    watch(src, 105).off();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clock += FRESH_CAP_MS - 1;
    const again = watch(src, 105);
    expect(again.now().status).toBe('ready');
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    again.off();

    clock += 1;
    watch(src, 105);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a failed page is tried again when a screen opens it again', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    fetchMock.mockImplementation(() => Promise.resolve(ok(105)));
    const src = source();
    const first = watch(src, 105);
    await settle();
    expect(first.now().status).toBe('error');
    first.off();
    const second = watch(src, 105);
    expect(second.now().status).toBe('loading');
    await settle();
    expect(second.now().status).toBe('ready');
  });

  it('stops telling a screen about changes after it unsubscribes', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok(105)));
    const src = source();
    const w = watch(src, 105);
    w.off();
    const count = w.seen.length;
    await settle();
    expect(w.seen.length).toBe(count);
    expect(src.getSnapshot(105).status).toBe('ready');
  });

  it('forgets pages no screen shows once there are many in memory', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.includes('/105.') ? ok(105) : status(404)),
    );
    const src = source();
    const shown = watch(src, 105);
    for (let p = 200; p < 200 + MAX_IN_MEMORY + 5; p++) watch(src, p).off();
    await settle();
    expect(shown.now().status).toBe('ready');
    // 200 was forgotten, so opening it again asks the network again.
    const calls = fetchMock.mock.calls.length;
    watch(src, 200);
    await settle();
    expect(fetchMock.mock.calls.length).toBe(calls + 1);
  });
});

describe('refresh', () => {
  it('fetches again even within 15 s and shows the new copy', async () => {
    fetchMock.mockResolvedValueOnce(ok(105, { 'X-Satanen-Fetched-At': SAVED_AT }));
    fetchMock.mockResolvedValueOnce(ok(105, { 'X-Satanen-Fetched-At': PROXY_AT }));
    const src = source();
    const w = watch(src, 105);
    await settle();
    const done = src.refresh(105);
    expect(w.now()).toMatchObject({ status: 'ready', refreshing: true });
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(w.now()).toMatchObject({ refreshing: false, offline: false });
    expect(w.now().updatedAt?.toISOString()).toBe(PROXY_AT);
  });

  it('joins a request already under way', async () => {
    const reply = deferred<Response>();
    fetchMock.mockReturnValue(reply.promise);
    const src = source();
    watch(src, 105);
    const done = src.refresh(105);
    reply.resolve(ok(105));
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the page on screen, marked offline, when the refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(ok(105, { 'X-Satanen-Fetched-At': PROXY_AT }));
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const src = source();
    const w = watch(src, 105);
    await settle();
    await src.refresh(105);
    expect(w.now()).toMatchObject({ status: 'ready', offline: true, reason: 'offline' });
    expect(w.now().updatedAt?.toISOString()).toBe(PROXY_AT);
  });

  it('after an error, shows loading again and can recover', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    fetchMock.mockResolvedValueOnce(ok(105));
    const src = source();
    const w = watch(src, 105);
    await settle();
    expect(w.now().status).toBe('error');
    const done = src.refresh(105);
    expect(w.now()).toMatchObject({ status: 'loading', reason: null });
    await done;
    expect(w.now().status).toBe('ready');
  });

  it('never rejects, even if fetch or storage throw', async () => {
    fetchMock.mockImplementation(() => {
      throw new Error('boom');
    });
    const src = source({
      loadSaved: () => Promise.reject(new Error('disk')),
      save: () => Promise.reject(new Error('disk')),
    });
    await expect(src.refresh(105)).resolves.toBeUndefined();
    expect(src.getSnapshot(105)).toMatchObject({ status: 'error', reason: 'offline' });
  });
});

describe('quiet checks when the reader returns (D39 A)', () => {
  it('marks a device copy as not yet fresh, until the network answers', async () => {
    saved(105);
    const reply = deferred<Response>();
    fetchMock.mockReturnValue(reply.promise);
    const w = watch(source(), 105);
    await settle();
    expect(w.now()).toMatchObject({ status: 'ready', fromDevice: true, refreshing: true });
    reply.resolve(ok(105));
    await settle();
    expect(w.now()).toMatchObject({ fromDevice: false, refreshing: false });
  });

  it('"Päivitetään…" shows until the first attempt, and not again on quiet offline retries', async () => {
    saved(105);
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const src = source();
    const w = watch(src, 105);
    src.focus(105);
    await Promise.resolve();
    await Promise.resolve();
    await settle();
    expect(w.seen.some(isUpdatingDeviceCopy)).toBe(true);
    expect(isUpdatingDeviceCopy(w.now())).toBe(false); // failed: "ei yhteyttä" instead
    const before = w.seen.length;
    clock += PAGE_LIMIT_MS;
    const retry = src.revalidate(105);
    expect(w.now()).toMatchObject({ refreshing: true, fromDevice: true });
    await retry;
    expect(w.seen.slice(before).some(isUpdatingDeviceCopy)).toBe(false);
  });

  it('a device copy that could not be refreshed is offline, still from the device', async () => {
    saved(105);
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const w = watch(source(), 105);
    await settle();
    expect(w.now()).toMatchObject({ offline: true, fromDevice: true, refreshing: false });
  });

  it('revalidate fetches only a copy past its limit', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok(105)));
    const src = source();
    watch(src, 105);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock += PAGE_LIMIT_MS - 1;
    await src.revalidate(105);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock += 1;
    await src.revalidate(105);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // A shorter limit can be asked for (FR.3 brings the proxy's own).
    clock += 1000;
    await src.revalidate(105, 1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a quiet fetch is `background`; the reader pulling meanwhile brings the spinner back', async () => {
    fetchMock.mockResolvedValueOnce(ok(105));
    const src = source();
    const w = watch(src, 105);
    await settle();
    const reply = deferred<Response>();
    fetchMock.mockReturnValueOnce(reply.promise);
    clock += PAGE_LIMIT_MS;
    const quiet = src.revalidate(105);
    expect(w.now()).toMatchObject({ refreshing: true, background: true, status: 'ready' });
    void src.refresh(105);
    expect(w.now()).toMatchObject({ refreshing: true, background: false });
    expect(fetchMock).toHaveBeenCalledTimes(2); // joined, not a second request
    reply.resolve(ok(105));
    await quiet;
    expect(w.now()).toMatchObject({ refreshing: false, background: false });
  });

  it('a quiet check of an error page keeps the error on screen until the answer', async () => {
    fetchMock.mockResolvedValue(status(404));
    const src = source();
    const w = watch(src, 105);
    await settle();
    expect(w.now().status).toBe('error');
    const before = w.seen.length;
    clock += RETRY_AFTER_FAIL_MS;
    const done = src.revalidate(105);
    expect(w.now()).toMatchObject({ status: 'error', refreshing: true });
    await done;
    expect(w.seen.slice(before).map((s) => s.status)).not.toContain('loading');
    expect(w.now()).toMatchObject({ status: 'error', refreshing: false });
  });

  it('after a failed fetch, waits before trying quietly again', async () => {
    fetchMock.mockResolvedValueOnce(ok(105));
    const src = source();
    watch(src, 105);
    await settle();
    fetchMock.mockRejectedValue(new TypeError('offline'));
    clock += PAGE_LIMIT_MS;
    await src.revalidate(105);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    clock += RETRY_AFTER_FAIL_MS - 1;
    await src.revalidate(105);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    clock += 1;
    await src.revalidate(105);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  describe('the limit from the proxy (FR.3)', () => {
    const at = (offsetMs: number) => new Date(clock + offsetMs).toISOString();
    const withHeaders = (n: number, ttl: number | string, ageMs = 0) =>
      ok(n, { 'X-Satanen-Ttl': String(ttl), 'X-Satanen-Fetched-At': at(-ageMs) });

    async function shownOnScreen(n: number, response: () => Response) {
      fetchMock.mockImplementation(() => Promise.resolve(response()));
      const src = source();
      watch(src, n);
      src.focus(n);
      await settle();
      fetchMock.mockClear();
      return src;
    }

    it('uses the proxy limit instead of the default for return checks', async () => {
      const src = await shownOnScreen(105, () => withHeaders(105, 1800));
      clock += PAGE_LIMIT_MS + 1_000; // past the 5 min default, inside 30 min
      src.revalidateShown();
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
      clock += 1800_000;
      src.revalidateShown();
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to the defaults when the header is missing or invalid', async () => {
      for (const response of [() => ok(105), () => ok(105, { 'X-Satanen-Ttl': '0' })]) {
        const src = await shownOnScreen(105, response);
        clock += PAGE_LIMIT_MS - 1;
        src.revalidateShown();
        await settle();
        expect(fetchMock).not.toHaveBeenCalled();
        clock += 1;
        src.revalidateShown();
        await settle();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      }
    });

    it('respects a doubled limit (240 s for a list)', async () => {
      const src = await shownOnScreen(100, () => withHeaders(100, 240));
      clock += 239_000;
      src.revalidateShown();
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
      clock += 1_000;
      src.revalidateShown();
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not treat a copy the proxy served 50 s old as fresh for 60 more seconds', async () => {
      const src = await shownOnScreen(221, () => withHeaders(221, 60, 50_000));
      clock += 9_000;
      src.revalidateShown();
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
      clock += 1_000; // the copy is now 60 s old, so due
      src.revalidateShown();
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not let another screen skip the fetch for a copy that aged in the proxy', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(withHeaders(221, 60, 50_000)));
      const src = source();
      watch(src, 221).off();
      await settle();
      fetchMock.mockClear();
      clock += 10_000;
      watch(src, 221);
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('an article copy that arrived 100 s old (limit 300 s) is not asked for again at once', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(withHeaders(105, 300, 100_000)));
      const src = source();
      watch(src, 105).off();
      await settle();
      fetchMock.mockClear();
      clock += 14_000;
      watch(src, 105);
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('the 60 s cap counts from arrival, even when the proxy could still return the copy', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(withHeaders(105, 300, 100_000)));
      const src = source();
      watch(src, 105).off();
      await settle();
      fetchMock.mockClear();
      clock += FRESH_CAP_MS;
      watch(src, 105);
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('a copy the proxy served as old (Yle down) counts from its arrival: no request storm', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          ok(221, {
            'X-Satanen-Stale': '1',
            'X-Satanen-Ttl': '60',
            'X-Satanen-Fetched-At': at(-3_600_000),
          }),
        ),
      );
      const src = source();
      watch(src, 221);
      src.focus(221);
      await settle();
      fetchMock.mockClear();
      clock += 30_000;
      src.revalidateShown(refetchesOnTimer); // timer tick
      watch(src, 221); // a second screen
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
      clock += 30_000; // the limit has passed
      src.revalidateShown(refetchesOnTimer);
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('caps the "just fetched" rule at 60 s even for a 30 min limit', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(withHeaders(400, 1800)));
      const src = source();
      watch(src, 400).off();
      await settle();
      fetchMock.mockClear();
      clock += FRESH_CAP_MS - 1;
      watch(src, 400).off();
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
      clock += 1;
      watch(src, 400);
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('ignores a proxy time in the future or older than the limit (wrong device clock)', async () => {
      const src = await shownOnScreen(105, () => withHeaders(105, 300, -3_600_000));
      clock += 299_000;
      src.revalidateShown();
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();

      const old = await shownOnScreen(109, () => withHeaders(109, 300, 3_600_000));
      clock += 299_000;
      old.revalidateShown();
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('timer: a live page on screen is re-fetched once its own limit has passed', async () => {
      const src = await shownOnScreen(221, () => withHeaders(221, 60));
      clock += 30_000;
      src.revalidateShown(refetchesOnTimer);
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
      clock += 30_000;
      src.revalidateShown(refetchesOnTimer);
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('timer: an article is not re-checked, but is on return', async () => {
      const src = await shownOnScreen(105, () => withHeaders(105, 300));
      clock += 600_000;
      src.revalidateShown(refetchesOnTimer);
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
      src.revalidateShown();
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('timer: a live page with a doubled limit (120 s) is still re-fetched, at that limit', async () => {
      const src = await shownOnScreen(221, () => withHeaders(221, 120));
      clock += 119_000;
      src.revalidateShown(refetchesOnTimer);
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
      clock += 1_000;
      src.revalidateShown(refetchesOnTimer);
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('timer: a page behind the front screen is not checked even when live', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(withHeaders(221, 60)));
      const src = source();
      watch(src, 221);
      await settle();
      fetchMock.mockClear();
      clock += 120_000;
      src.revalidateShown(refetchesOnTimer);
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('revalidateShown checks only pages on the screen in front', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(ok(Number(/\/(\d{3})\.json/.exec(String(url))![1]))),
    );
    const src = source();
    watch(src, 105);
    src.focus(105);
    watch(src, 102); // subscribed (a hidden tab), never in front
    const left = watch(src, 130);
    const unfocus = src.focus(130);
    await settle();
    unfocus(); // went behind another screen
    left.off();
    fetchMock.mockClear();
    clock += PAGE_LIMIT_MS;
    src.revalidateShown();
    await settle();
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining('/105.json'),
    ]);
  });

  it('revalidateShown can be limited to some pages (the timer: lists only)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok(105)));
    const src = source();
    watch(src, 105);
    src.focus(105);
    await settle();
    fetchMock.mockClear();
    clock += PAGE_LIMIT_MS;
    src.revalidateShown((n) => n !== 105);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a page coming to the front is checked if it is past its limit', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok(105)));
    const src = source();
    watch(src, 105);
    await settle();
    src.focus(105)(); // in front within its limit, then behind again
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock += PAGE_LIMIT_MS;
    src.focus(105);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchFresh: asking the proxy for a newer copy (D39 C)', () => {
  const urls = () => fetchMock.mock.calls.map((c) => c[0] as string);

  it('sends ?fresh=1, quietly, and shows the answer', async () => {
    fetchMock.mockResolvedValueOnce(ok(105)).mockResolvedValueOnce(ok(136));
    const src = source();
    const w = watch(src, 105);
    await settle();
    expect(w.now().page?.number).toBe(105);

    const done = src.fetchFresh(105);
    expect(w.now()).toMatchObject({ refreshing: true, background: true });
    await done;
    expect(urls()).toEqual([
      'http://proxy.test/v1/pages/105.json',
      'http://proxy.test/v1/pages/105.json?fresh=1',
    ]);
    expect(w.now().page?.number).toBe(136);
    expect(w.now()).toMatchObject({ refreshing: false, background: false });
  });

  it('waits for a request under way, so its own answer is the last one shown', async () => {
    const first = deferred<Response>();
    fetchMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok(136));
    const src = source();
    const w = watch(src, 105);
    const done = src.fetchFresh(105);
    await settle();
    expect(urls()).toEqual(['http://proxy.test/v1/pages/105.json']);
    first.resolve(ok(105));
    await done;
    expect(urls()).toEqual([
      'http://proxy.test/v1/pages/105.json',
      'http://proxy.test/v1/pages/105.json?fresh=1',
    ]);
    expect(w.now().page?.number).toBe(136);
  });

  it('a 404 answer shows the not-found state', async () => {
    fetchMock.mockResolvedValueOnce(ok(105)).mockResolvedValueOnce(status(404));
    const src = source();
    const w = watch(src, 105);
    await settle();
    await src.fetchFresh(105);
    expect(w.now()).toMatchObject({ status: 'error', reason: 'not-found', page: null });
  });

  it('never rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('down'));
    await expect(source().fetchFresh(105)).resolves.toBeUndefined();
  });
});
