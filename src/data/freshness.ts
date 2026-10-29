/**
 * How long a page counts as fresh, and the app coming back to the foreground
 * (D39 A). Plain functions with no React or platform code, so the rules can be
 * tested with a fake clock; `watchForeground.ts` wires them to the browser and
 * the phone.
 */

/** Headline lists: Yle's index pages that the front page and the feeds are built from. */
export const LIST_LIMIT_MS = 2 * 60_000;
/** Everything else (articles, results, weather) until the proxy sends its own limit. */
export const PAGE_LIMIT_MS = 5 * 60_000;

/**
 * Index pages, i.e. headline lists (D39 B: 100, 102, 130, 160, 200 and the
 * other index pages). Only the ones the app shows as lists or section fronts.
 */
const LIST_PAGES: ReadonlySet<number> = new Set([100, 101, 102, 130, 160, 190, 199, 200, 201]);

/** The most a limit from the proxy may be: doubled "other" pages (2 x 1800 s). */
export const MAX_LIMIT_MS = 3600_000;
/** Up to this long a page just fetched is not fetched again when another screen opens it. */
export const FRESH_CAP_MS = 60_000;
/** Pages with a limit this short are live pages: the proxy's 60 s, or 120 s doubled under load. */
export const LIVE_LIMIT_MS = 120_000;

/**
 * The limit from the proxy's `X-Satanen-Ttl` header (whole seconds), in
 * milliseconds. Null for a missing or unusable value (empty, not a number,
 * zero, negative), so the caller falls back to `pageLimitMs`. A huge value is
 * cut to `MAX_LIMIT_MS`, so a bad header can't freeze a page for days.
 */
export function limitFromHeader(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^\s*\d+(\.\d+)?\s*$/.test(value)) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(Math.round(seconds * 1000), MAX_LIMIT_MS);
}

/**
 * How old page `n`'s copy may get before the app asks again, when the proxy
 * hasn't told (yet): the defaults. The page source uses the proxy's own limit
 * (D39 B) when it has one.
 */
export function pageLimitMs(n: number): number {
  return LIST_PAGES.has(n) ? LIST_LIMIT_MS : PAGE_LIMIT_MS;
}

/**
 * Pages the timer re-fetches while they are on the screen in front: the
 * headline lists, and live pages (limit of 120 s or less, as the proxy sends
 * it: 60 s, doubled under load). Articles and other pages are checked when the reader comes back or the
 * screen comes to the front again, not on the timer, to spare Yle's budget
 * (D39 B). `limitMs` is the page's limit; without it the default is used.
 * A live page still on the timer at its doubled limit refreshes more slowly,
 * which spares the budget without freezing the screen.
 */
export function refetchesOnTimer(n: number, limitMs: number = pageLimitMs(n)): boolean {
  return LIST_PAGES.has(n) || limitMs <= LIVE_LIMIT_MS;
}

/** While the app is on screen, it looks this often for copies past their limit. */
export const TICK_MS = 30_000;
/** A quiet re-fetch that failed is not tried again sooner than this. */
export const RETRY_AFTER_FAIL_MS = 30_000;
/** Away from the app longer than this, a list on screen is simply replaced (D39 A). */
export const LONG_AWAY_MS = 5 * 60_000;

/**
 * `reason`: the app came back to the foreground (`return`), or a timer tick
 * while it stays open (`tick`). `awayMs`: how long it was hidden; 0 for a tick.
 */
export type ForegroundListener = (awayMs: number, reason: 'return' | 'tick') => void;

export interface Foreground {
  /** The tab is visible (web) or the app is active (phones). */
  setVisible(visible: boolean): void;
  /** A timer tick while on screen (and the web's "back online"). Ignored while hidden. */
  tick(): void;
  isVisible(): boolean;
  subscribe(listener: ForegroundListener): () => void;
}

export function createForeground({ now = Date.now }: { now?: () => number } = {}): Foreground {
  const listeners = new Set<ForegroundListener>();
  let visible = true;
  let hiddenAt: number | null = null;

  function emit(awayMs: number, reason: 'return' | 'tick') {
    for (const listener of [...listeners]) {
      try {
        listener(awayMs, reason);
      } catch {
        // a broken screen must not stop the others
      }
    }
  }

  return {
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      if (!next) {
        hiddenAt = now();
        return;
      }
      const away = hiddenAt === null ? 0 : Math.max(0, now() - hiddenAt);
      hiddenAt = null;
      emit(away, 'return');
    },
    tick() {
      if (visible) emit(0, 'tick');
    },
    isVisible: () => visible,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
