// Where screens get pages from (D14). One shared source per app: it shows the
// copy saved on the device at once, then fetches a fresh one through the
// proxy. Screens asking for the same page share one request, and a page that
// arrived less than `FRESH_CAP_MS` ago, while the proxy could only return the
// same copy, isn't fetched again. `usePage` is the React side.
//
// Coming back to the app (D39 A): only the screen in front counts as shown
// (`focus`; screens further back in the stack and hidden tabs don't, and
// neither do favourite cards or "next page" links). `revalidateShown` quietly
// fetches again every focused page whose copy is older than its limit
// (the limit the proxy sent, else `pageLimitMs`); a screen coming to the front
// does the same for its page; `revalidate` does it for one page (the feeds'
// index pages). Quiet means
// `background: true`: no pull-to-refresh spinner. A quiet fetch that failed
// waits `RETRY_AFTER_FAIL_MS` before the next one.
//
// `fetchFresh` (D39 C) is a quiet fetch with `?fresh=1`: the article didn't
// match its list's headline, so the proxy is asked for a newer copy than the
// one it holds (it decides; at most once per 30 s per page).
//
// Plain functions with no React, so every path can be tested with a fake
// fetch, storage and clock.

import { getPage, type GetPageOptions, type PageErrorReason, type PageResult } from '../api/client';
import type { Page } from '../parser/model';
import { normalize } from '../parser/normalize';
import { FRESH_CAP_MS, pageLimitMs, RETRY_AFTER_FAIL_MS } from './freshness';
import { loadSavedPage, savePage, type SavedPage } from './pageCache';

/** Pages kept in memory without a screen showing them. */
export const MAX_IN_MEMORY = 50;

export interface PageState {
  /** `loading`: nothing to show yet. `ready`: `page` is set. `error`: see `reason`. */
  status: 'loading' | 'ready' | 'error';
  page: Page | null;
  /** When the shown copy was fetched (for "Päivitetty 14:32"). Null without a page. */
  updatedAt: Date | null;
  /** True when a fresh copy couldn't be fetched and an older copy is shown. */
  offline: boolean;
  /** The proxy served its last good copy because Yle was unreachable (D11). */
  stale: boolean;
  /**
   * Why the last fetch failed; null when it succeeded or hasn't finished.
   * Set both on `error` and on `ready` + `offline`.
   */
  reason: PageErrorReason | null;
  /** A request to the proxy is under way. */
  refreshing: boolean;
  /**
   * The request under way is a quiet check (the reader came back, or a timer):
   * show no spinner. False when the reader asked (pull to refresh).
   */
  background: boolean;
  /** The page shown is the copy saved on the device, not yet a network answer ("Päivitetään…"). */
  fromDevice: boolean;
}

/**
 * "Päivitetään…": a device copy is shown while its first fresh copy loads.
 * Once that has failed (`offline`, "ei yhteyttä"), quiet retries don't bring
 * the mark back, so it doesn't flicker every 30 s.
 */
export function isUpdatingDeviceCopy(
  s: Pick<PageState, 'fromDevice' | 'refreshing' | 'offline'>,
): boolean {
  return s.fromDevice && s.refreshing && !s.offline;
}

export interface PageSourceOptions {
  fetchPage?: (n: number, options?: GetPageOptions) => Promise<PageResult>;
  loadSaved?: (n: number) => Promise<SavedPage | null>;
  save?: (n: number, raw: unknown, fetchedAt: Date) => Promise<void>;
  /** Milliseconds, like Date.now. */
  now?: () => number;
}

export interface PageSource {
  getSnapshot(n: number): PageState;
  /** Starts loading page `n` if needed and calls `listener` on every change. */
  subscribe(n: number, listener: () => void): () => void;
  /** Fetches page `n` again now, joining a request already under way. Never rejects. */
  refresh(n: number): Promise<void>;
  /**
   * Fetches page `n` quietly if its copy is older than `maxAgeMs` (default:
   * the page's limit), joining a request already under way. Resolves when the
   * page has settled. Never rejects.
   */
  revalidate(n: number, maxAgeMs?: number): Promise<void>;
  /**
   * Asks the proxy quietly for a newer copy of page `n` than the one it holds
   * (`?fresh=1`, D39 C): the article didn't match the headline its list
   * showed. Waits for a request under way first, so the answer is never an
   * older request's. The proxy decides whether Yle is asked again. Never rejects.
   */
  fetchFresh(n: number): Promise<void>;
  /**
   * Page `n` is on the screen in front, until the returned function is
   * called. Fetches it quietly now if its copy is past its limit.
   */
  focus(n: number): () => void;
  /** `revalidate` for every focused page (only those `which(n, limitMs)` accepts, if given). */
  revalidateShown(which?: (n: number, limitMs: number) => boolean): void;
}

interface Entry {
  state: PageState;
  listeners: Set<() => void>;
  inflight: Promise<void> | null;
  /**
   * Clock time the shown copy was fetched from Yle: the proxy's own time when
   * it sent one (the copy may have aged in its cache), never later than now.
   */
  fetchedAt: number | null;
  /** Clock time the last answer arrived at the app. */
  arrivedAt: number | null;
  /** The limit the proxy sent with the last answer (ms); null until it has. */
  limitMs: number | null;
  /** Clock time of the last failed fetch. */
  failedAt: number | null;
  triedDevice: boolean;
  /** Screens in front showing this page (`focus`). */
  focused: number;
}

const INITIAL: PageState = {
  status: 'loading',
  page: null,
  updatedAt: null,
  offline: false,
  stale: false,
  reason: null,
  refreshing: false,
  background: false,
  fromDevice: false,
};

export function createPageSource(options: PageSourceOptions = {}): PageSource {
  const fetchPage = options.fetchPage ?? getPage;
  const loadSaved = options.loadSaved ?? loadSavedPage;
  const save = options.save ?? savePage;
  const now = options.now ?? Date.now;
  const entries = new Map<number, Entry>();

  function forgetUnused() {
    for (const [n, e] of entries) {
      if (entries.size <= MAX_IN_MEMORY) return;
      if (e.listeners.size === 0 && e.focused === 0 && !e.inflight) entries.delete(n);
    }
  }

  function entry(n: number): Entry {
    let e = entries.get(n);
    if (!e) {
      e = {
        state: INITIAL,
        listeners: new Set(),
        inflight: null,
        fetchedAt: null,
        arrivedAt: null,
        limitMs: null,
        failedAt: null,
        triedDevice: false,
        focused: 0,
      };
      entries.set(n, e);
      forgetUnused();
    }
    return e;
  }

  function update(e: Entry, patch: Partial<PageState>) {
    e.state = { ...e.state, ...patch };
    for (const listener of [...e.listeners]) {
      try {
        listener();
      } catch {
        // a broken screen must not stop the others
      }
    }
  }

  async function readDevice(n: number): Promise<{ page: Page; fetchedAt: Date } | null> {
    try {
      const saved = await loadSaved(n);
      if (!saved) return null;
      const result = normalize(saved.raw);
      // A copy of another page would mean damaged storage: ignore it.
      if (!result.ok || result.page.number !== n) return null;
      return { page: result.page, fetchedAt: saved.fetchedAt };
    } catch {
      return null;
    }
  }

  /**
   * When the copy was fetched from Yle, for the age check. The proxy's time
   * counts, so a copy that already aged there is not treated as fresh. If it
   * is in the future or older than the limit (not possible for a fresh copy,
   * so the device clock is off), or the proxy sent none, the copy is as old as
   * the answer. A copy the proxy served as old (Yle down) also counts from
   * the answer: counted from its own time it would always be past its limit,
   * and every tick and screen would ask the proxy, and so Yle, again.
   */
  function copyTime(result: Extract<PageResult, { ok: true }>): number {
    const t = now();
    const at = result.fetchedAt?.getTime();
    if (at === undefined || result.stale) return t;
    if (at > t) return t;
    if (result.limitMs !== null && t - at > result.limitMs) return t;
    return at;
  }

  function limitOf(n: number, e: Entry): number {
    return e.limitMs ?? pageLimitMs(n);
  }

  async function run(n: number, e: Entry, background: boolean, fresh: boolean): Promise<void> {
    if (e.state.page) update(e, { refreshing: true, background });
    // A quiet check keeps an error on screen until the answer, so it doesn't flicker.
    else if (background) update(e, { refreshing: true, background });
    else update(e, { status: 'loading', reason: null, refreshing: true, background });

    let arrived = false;
    let device: Promise<void> = Promise.resolve();
    if (!e.triedDevice && !e.state.page) {
      e.triedDevice = true;
      device = readDevice(n).then((copy) => {
        // Show the saved copy unless the network already gave a newer one.
        if (copy && !arrived && !e.state.page) {
          update(e, {
            status: 'ready',
            page: copy.page,
            updatedAt: copy.fetchedAt,
            offline: false,
            stale: false,
            fromDevice: true,
          });
        }
      });
    }

    let result: PageResult;
    try {
      result = await (fresh ? fetchPage(n, { fresh: true }) : fetchPage(n));
    } catch {
      result = { ok: false, reason: 'offline' };
    }

    if (result.ok) {
      arrived = true;
      const fetchedAt = result.fetchedAt ?? new Date(now());
      e.fetchedAt = copyTime(result);
      e.arrivedAt = now();
      e.limitMs = result.limitMs;
      e.failedAt = null;
      update(e, {
        status: 'ready',
        page: result.page,
        updatedAt: fetchedAt,
        offline: false,
        stale: result.stale,
        reason: null,
        refreshing: false,
        background: false,
        fromDevice: false,
      });
      void save(n, result.raw, fetchedAt).catch(() => undefined);
      return;
    }

    await device;
    e.failedAt = now();
    // "not-found" means the page is gone from Teksti-TV, so an old copy would mislead.
    if (e.state.page && result.reason !== 'not-found') {
      update(e, {
        status: 'ready',
        offline: true,
        reason: result.reason,
        refreshing: false,
        background: false,
      });
    } else {
      update(e, { ...INITIAL, status: 'error', reason: result.reason });
    }
  }

  function load(n: number, e: Entry, background = false, fresh = false): Promise<void> {
    if (!e.inflight) {
      e.inflight = run(n, e, background, fresh)
        .catch(() => undefined)
        .finally(() => {
          e.inflight = null;
        });
    } else if (!background && e.state.background) {
      // The reader asked while a quiet check was under way: now show the spinner.
      update(e, { background: false });
    }
    return e.inflight;
  }

  /** The copy is past its limit, and a quiet fetch didn't just fail. */
  function due(e: Entry, maxAgeMs: number): boolean {
    const t = now();
    if (e.fetchedAt !== null && t - e.fetchedAt < maxAgeMs) return false;
    return e.failedAt === null || t - e.failedAt >= Math.min(maxAgeMs, RETRY_AFTER_FAIL_MS);
  }

  /**
   * A fetch right now could only bring the same copy: the proxy still has it
   * (inside its limit), and it arrived here less than `FRESH_CAP_MS` ago.
   */
  function isRecent(n: number, e: Entry): boolean {
    if (e.fetchedAt === null || e.arrivedAt === null) return false;
    const t = now();
    return t - e.fetchedAt < limitOf(n, e) && t - e.arrivedAt < FRESH_CAP_MS;
  }

  function revalidate(n: number, maxAgeMs?: number): Promise<void> {
    const e = entry(n);
    maxAgeMs ??= limitOf(n, e);
    if (e.inflight) return e.inflight;
    return due(e, maxAgeMs) ? load(n, e, true) : Promise.resolve();
  }

  return {
    getSnapshot: (n) => entry(n).state,
    subscribe(n, listener) {
      const e = entry(n);
      e.listeners.add(listener);
      const recent = isRecent(n, e);
      if (!e.inflight && !recent) void load(n, e);
      return () => {
        e.listeners.delete(listener);
      };
    },
    refresh: (n) => load(n, entry(n)),
    revalidate,
    async fetchFresh(n) {
      const e = entry(n);
      // An answer to a request sent earlier could be the copy that didn't match.
      while (e.inflight) await e.inflight;
      await load(n, e, true, true);
    },
    focus(n) {
      const e = entry(n);
      e.focused += 1;
      void revalidate(n);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        e.focused -= 1;
      };
    },
    revalidateShown(which) {
      for (const [n, e] of [...entries]) {
        if (e.focused > 0 && (!which || which(n, limitOf(n, e)))) void revalidate(n);
      }
    },
  };
}
