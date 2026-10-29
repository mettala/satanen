// Being kind to Yle when it fails, and asking it once for many readers
// (PUB.14, D39 amendment). In memory per Worker copy, like the hourly count in
// ttl.ts: Cloudflare may run several copies or restart one, and each copy
// remembers on its own. Timers are judged from the clock passed in (the
// Worker's `deps.now()`), never from background timers.

/**
 * Yle said 401 (key refused, or the hour's quota used up) or 429 (too many
 * requests). That is about the whole key, not one page, so for this long no
 * page or picture is asked from Yle. Asking again at once would only add
 * requests that count against Yle's 300 an hour (D39) and our own cap
 * (`YLE_HOURLY_CAP`, PUB.6), and may make Yle's lockout longer. 60 s is the
 * shortest page limit (live results, D39 B), so a recovered key is used
 * again within a minute.
 */
export const QUOTA_PAUSE_S = 60;

/**
 * Yle answered 5xx or a redirect, took more than 8 s, or could not be
 * reached. Only that one path waits this long: readers get the last good
 * copy (D11) at once instead of waiting up to 8 s on every tap while Yle is
 * down. Short, so a recovered Yle shows within 15 s.
 */
export const ERROR_PAUSE_S = 15;

/** What a failed Yle request says about the key: `quota` pauses every path, `error` only its own. */
export type FailureKind = 'quota' | 'error';

/** The kind of failure for Yle's answer, or null when Yle answered (200 or 404). */
export function failureOf(upstream: number | 'timeout' | 'failed'): FailureKind | null {
  if (upstream === 'timeout' || upstream === 'failed') return 'error';
  if (upstream === 200 || upstream === 404) return null;
  if (upstream === 401 || upstream === 429) return 'quota';
  // 5xx, any 3xx (never followed, see index.ts) and anything else unexpected.
  return 'error';
}

/** Paths kept before expired pauses are swept out (a bound on memory, not a limit on paths). */
const SWEEP_AT = 200;

/**
 * Remembers recent Yle failures. A pause ends when its time is up; an answer
 * from Yle (200 or 404) for a path also ends that path's own pause.
 */
export class YlePause {
  /** Every path waits until this time (ms), after a 401 or 429. */
  private allUntil = 0;
  /** One path waits until this time (ms), after a 5xx, redirect, timeout or network error. */
  private pathUntil = new Map<string, number>();

  /** Whole seconds this path must still wait (at least 1), or 0 when Yle may be asked. */
  waitS(path: string, nowMs: number): number {
    const own = this.pathUntil.get(path) ?? 0;
    if (own && own <= nowMs) this.pathUntil.delete(path);
    const until = Math.max(this.allUntil, own);
    return until > nowMs ? Math.max(1, Math.ceil((until - nowMs) / 1000)) : 0;
  }

  /** Yle failed for `path`, seen at `nowMs`. */
  failed(path: string, kind: FailureKind, nowMs: number): void {
    if (kind === 'quota') {
      this.allUntil = Math.max(this.allUntil, nowMs + QUOTA_PAUSE_S * 1000);
      return;
    }
    if (this.pathUntil.size >= SWEEP_AT) {
      for (const [p, until] of this.pathUntil) if (until <= nowMs) this.pathUntil.delete(p);
    }
    const until = nowMs + ERROR_PAUSE_S * 1000;
    this.pathUntil.set(path, Math.max(this.pathUntil.get(path) ?? 0, until));
  }

  /**
   * Yle answered `path` (200 or 404): that path's own pause is forgotten.
   * The pause for every path is not ended by an answer, only by time: while
   * it lasts nothing is sent, so any answer that arrives is to a request sent
   * before the 401 or 429, and says nothing about whether the key works now.
   */
  succeeded(path: string): void {
    this.pathUntil.delete(path);
  }

  /** Paths with a pause remembered (for the memory test). */
  get size(): number {
    return this.pathUntil.size;
  }
}

/**
 * Identical requests in flight share one Yle request. While a path is being
 * asked from Yle, the next request for it waits for the same answer instead of
 * sending its own. The entry is removed when the answer (or failure) is in,
 * so the next miss asks again (after any pause).
 */
export class InFlight<T> {
  private map = new Map<string, { promise: Promise<T>; startedMs: number }>();

  /**
   * @param maxAgeMs An entry older than this is not joined but forgotten, and
   *   the next request asks Yle itself. A safety net only: Yle gives up after
   *   8 s, and the entry is removed as soon as the answer is in. It guards
   *   against an answer that never comes (if Cloudflare ever cancelled the
   *   request that asked), which would otherwise leave the path stuck.
   */
  constructor(private readonly maxAgeMs = 10_000) {}

  /** The request already in flight for `key`, if any (and not too old). */
  get(key: string, nowMs: number): Promise<T> | undefined {
    const entry = this.map.get(key);
    if (entry && nowMs - entry.startedMs >= this.maxAgeMs) {
      this.map.delete(key);
      return undefined;
    }
    return entry?.promise;
  }

  /**
   * Starts `start()` and shares it under `key`. Call only after `get(key)`
   * found nothing, with no `await` in between. `start` must not reject: the
   * outcome, failures included, is delivered to every waiter as a value.
   */
  run(key: string, nowMs: number, start: () => Promise<T>): Promise<T> {
    const promise: Promise<T> = start().finally(() => {
      if (this.map.get(key)?.promise === promise) this.map.delete(key);
    });
    this.map.set(key, { promise, startedMs: nowMs });
    return promise;
  }

  /** Requests in flight (for the memory test). */
  get size(): number {
    return this.map.size;
  }
}
