import { describe, expect, it } from 'vitest';
import { ERROR_PAUSE_S, failureOf, InFlight, QUOTA_PAUSE_S, YlePause } from './upstream.ts';

const T = Date.parse('2026-10-25T12:00:00Z');
const s = (n: number) => n * 1000;

describe('failureOf: what a Yle answer says', () => {
  it.each([200, 404])('%i is an answer, not a failure', (status) => {
    expect(failureOf(status)).toBeNull();
  });

  it.each([401, 429])('%i is about the key: every path waits', (status) => {
    expect(failureOf(status)).toBe('quota');
  });

  it.each([500, 502, 503, 504, 301, 302, 304, 307, 308, 0, 400, 403])(
    '%i fails only its own path',
    (status) => {
      expect(failureOf(status)).toBe('error');
    },
  );

  it.each(['timeout', 'failed'] as const)('%s fails only its own path', (what) => {
    expect(failureOf(what)).toBe('error');
  });
});

describe('YlePause', () => {
  it('waits nothing before any failure', () => {
    expect(new YlePause().waitS('/v1/pages/100.json', T)).toBe(0);
  });

  it('a quota failure pauses every path for QUOTA_PAUSE_S', () => {
    const p = new YlePause();
    p.failed('/v1/pages/100.json', 'quota', T);
    expect(p.waitS('/v1/pages/100.json', T)).toBe(QUOTA_PAUSE_S);
    expect(p.waitS('/v1/images/300/1.png', T + s(30))).toBe(30);
    expect(p.waitS('/v1/pages/101.json', T + s(QUOTA_PAUSE_S) - 1)).toBe(1);
    expect(p.waitS('/v1/pages/101.json', T + s(QUOTA_PAUSE_S))).toBe(0);
  });

  it('an error pauses only its own path for ERROR_PAUSE_S', () => {
    const p = new YlePause();
    p.failed('/v1/pages/100.json', 'error', T);
    expect(p.waitS('/v1/pages/100.json', T)).toBe(ERROR_PAUSE_S);
    expect(p.waitS('/v1/pages/101.json', T)).toBe(0);
    expect(p.waitS('/v1/pages/100.json', T + s(ERROR_PAUSE_S))).toBe(0);
  });

  it('says at least 1 s while a pause lasts (Retry-After is whole seconds)', () => {
    const p = new YlePause();
    p.failed('/a', 'error', T);
    expect(p.waitS('/a', T + s(ERROR_PAUSE_S) - 1)).toBe(1);
  });

  it('a path with both waits for the longer one', () => {
    const p = new YlePause();
    p.failed('/a', 'quota', T);
    p.failed('/a', 'error', T + s(50));
    expect(p.waitS('/a', T + s(55))).toBe(10);
    expect(p.waitS('/b', T + s(55))).toBe(5);
  });

  it('an answer for a path forgets its own pause', () => {
    const p = new YlePause();
    p.failed('/a', 'error', T);
    p.succeeded('/a');
    expect(p.waitS('/a', T)).toBe(0);
    expect(p.size).toBe(0);
  });

  it('an answer does not end the pause for every path (only time does)', () => {
    const p = new YlePause();
    p.failed('/a', 'quota', T);
    p.succeeded('/b');
    expect(p.waitS('/c', T + s(1))).toBe(QUOTA_PAUSE_S - 1);
  });

  it('a later failure never shortens a pause', () => {
    const p = new YlePause();
    p.failed('/a', 'quota', T + s(30));
    p.failed('/a', 'quota', T);
    expect(p.waitS('/x', T + s(60))).toBe(30);
  });

  it('forgets expired paths, so memory stays small however many paths fail', () => {
    const p = new YlePause();
    for (let i = 0; i < 5000; i++) p.failed(`/v1/pages/${i}.json`, 'error', T + s(i * 20));
    expect(p.size).toBeLessThanOrEqual(201);
  });

  it('an expired path is forgotten when it is next looked at', () => {
    const p = new YlePause();
    p.failed('/a', 'error', T);
    expect(p.waitS('/a', T + s(ERROR_PAUSE_S))).toBe(0);
    expect(p.size).toBe(0);
  });
});

describe('InFlight', () => {
  const deferred = <T>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  it('shares one start under a key until it settles, then forgets it', async () => {
    const f = new InFlight<string>();
    const d = deferred<string>();
    let starts = 0;
    const first = f.run('/a', T, () => {
      starts++;
      return d.promise;
    });
    expect(f.get('/a', T + 1)).toBe(first);
    expect(f.get('/b', T + 1)).toBeUndefined();
    d.resolve('page');
    expect(await f.get('/a', T + 1)).toBe('page');
    expect(starts).toBe(1);
    expect(f.size).toBe(0);
  });

  it('forgets the key after a rejection too', async () => {
    const f = new InFlight<string>();
    const p = f.run('/a', T, () => Promise.reject(new Error('boom')));
    await expect(p).rejects.toThrow('boom');
    expect(f.size).toBe(0);
  });

  it('a settled request does not remove a newer one under the same key', async () => {
    const f = new InFlight<string>();
    const a = deferred<string>();
    const b = deferred<string>();
    const first = f.run('/a', T, () => a.promise);
    // Only reachable if a caller ignored `get`; the map must still not lose the newer entry.
    const second = f.run('/a', T, () => b.promise);
    a.resolve('old');
    await first;
    expect(f.get('/a', T)).toBe(second);
    b.resolve('new');
    await second;
    expect(f.size).toBe(0);
  });

  it('an entry that never settles is not joined after 10 s, and is forgotten', () => {
    const f = new InFlight<string>();
    const stuck = f.run('/a', T, () => new Promise<string>(() => {}));
    expect(f.get('/a', T + s(10) - 1)).toBe(stuck);
    expect(f.get('/a', T + s(10))).toBeUndefined();
    expect(f.size).toBe(0);
  });
});
