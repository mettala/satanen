/**
 * The feeds' memory (decisions D26, D27, D28): one snapshot per feed, built
 * from the index pages through the shared page source (D14), plus the items'
 * first paragraphs, scroll positions and the lists articles take "next" from.
 *
 * Plain functions with no React, so every rule can be tested with a fake page
 * source. `useFeed` (useFeed.ts) is the React side, on the app's one store.
 *
 * Rules (each has a test in feedStore.test.ts):
 *
 * - Building: the list is fixed only once every index page has a network
 *   answer or a failure. A device copy shown while the request is under way
 *   doesn't count, so the reader never sees an old list swapped for a new one.
 *   Offline, the page source falls back to the device copies, and the feed is
 *   marked `offline`. A feed whose index pages were read for another feed in
 *   the last `REUSE_INDEX_MS` (the Kotimaa chip after Kaikki) is built from
 *   those copies at once; older copies are fetched again.
 * - After that the shown list never follows the page source by itself, so it
 *   is never swapped under the reader's finger. `refresh()` (pull to refresh)
 *   builds a new one. If an index page fails, the copy the app already had is
 *   kept (marked `offline`); if every page fails, the list stays as it was.
 *   "Not found" counts as a failure too: section index pages don't go away,
 *   so a 404 there is a short glitch at Yle, and dropping the copy would
 *   silently drop a whole half of Uutiset.
 * - Checks (D39 A): a list older than its limit (`pageLimitMs` of its index
 *   pages) is checked quietly when it is opened again or comes to the front
 *   (`focus`), and by `revalidate()` while it is the screen in front (the app
 *   came back to the foreground, or a timer). Lists in hidden tabs or behind
 *   an article wait until they come to the front.
 *   The index pages come through the page source's `revalidate`, so a page
 *   another screen fetched recently costs no request. The new list is then
 *   compared with the shown one (`listUpdate`): the same stories in the same
 *   order change nothing visible; otherwise, if the reader was away more than
 *   `LONG_AWAY_MS` (and hasn't scrolled since) or is at the top, it replaces
 *   the list; else it waits (`hasUpdate`, the "Päivitä lista" button) until
 *   `applyUpdate()` or the reader scrolls to the top. Scrolling after coming
 *   back ends "away": the reader is reading again, even if the first check
 *   failed because the phone had no network yet. A check that can't reach an index page keeps
 *   the list and marks it `offline`. Replacing a list puts its saved place
 *   back at the top.
 * - `stale`: some index page is the proxy's last good copy (Yle didn't
 *   answer, D11). A device copy shown offline is `offline`, not `stale`.
 * - First paragraphs are asked for the visible items plus the next 6
 *   (`AHEAD`), in list order, never more than 4 at once (`MAX_IN_FLIGHT`)
 *   across all feeds. The feed last shown goes first. Each is taken once,
 *   from the network answer, and kept for the whole session, keyed by page
 *   and headline (so a page number reused for a new story is asked again).
 *   Failures and offline copies are asked again after `refresh()`.
 *   Talous's service items (D40: rates, stock pages) are tables: they are
 *   never asked for and show only their headline (`none`, not loading).
 * - An offline copy of an article saved more than `OFFLINE_COPY_SLACK_MS`
 *   before or after the feed's index pages is not used unless its heading
 *   matches the list's headline (`matchHeadline` says `same`): page numbers
 *   are reused for new stories, so it may be another story's text. The item
 *   then shows only its headline.
 * - Anything a page source throws counts as a failure of that page only.
 * - Etusivu (M3.33) is a list too, but not a snapshot: its items come from
 *   page 100 as the front page shows it (`registerList`), and its first
 *   paragraphs load with the same rules (window, limit, once per story).
 *   Each new copy of page 100 counts as a refresh: items that failed or
 *   came from an offline copy are asked again.
 * - Lists and articles are checked against each other (D39 C, FR.4):
 *   `checkArticle` runs once each time an article is opened from a list.
 *   When the article's network copy is another story than the list's
 *   headline (`matchHeadline`), the proxy is asked once for a fresh copy
 *   (`fetchFresh`, `?fresh=1`). If that one matches, the item's first
 *   paragraph is taken again from it. If it still differs, the list is the
 *   outdated side: its index pages (page 100 for Etusivu) are fetched again
 *   quietly and compared like any check, so the list is never swapped under
 *   the reader's finger ("Päivitä lista"). Nothing is done for an error
 *   (a 404 shows the not-found state; the item leaves the list at its next
 *   refresh, since lists come from Yle's index pages), a device copy, the
 *   proxy's old copy (Yle is down: asking again can't help), or a page with
 *   no heading.
 */
import type { PageErrorReason } from '../api/client';
import type { PageSource, PageState } from '../data/pageSource';
import { leadIngress, type LeadIngress } from '../front/leadIngress';
import { LONG_AWAY_MS, pageLimitMs } from '../data/freshness';
import type { Page } from '../parser/model';
import { FEED_IDS, FEED_PAGES, feedList, type FeedId, type FeedItem } from './feedList';
import { matchHeadline } from './headlineMatch';
import { pageHeadline } from './pageHeadline';
import { AT_TOP_PX, isAtTop, listUpdate, storyKey } from './listUpdate';

/** First paragraphs are loaded this many items past the last visible one. */
export const AHEAD = 6;
/** Never more first-paragraph requests than this at once. */
export const MAX_IN_FLIGHT = 4;
/**
 * How far from the index pages' time an offline article copy may be, either
 * way. Covers the proxy's 45 s cache (D11) and the minutes a reader spends in
 * the feed. A copy outside it is still used when its heading matches the
 * list's headline (`matchHeadline`).
 */
export const OFFLINE_COPY_SLACK_MS = 10 * 60_000;
/** Index copies younger than this are reused by another feed without a request. */
export const REUSE_INDEX_MS = 10 * 60_000;

/** Lists an article can take its previous and next story from (D28). */
export type ListId = FeedId | 'etusivu';

/** Etusivu's list is page 100 (`FRONT_PAGE` in FrontPageView), held by the front page. */
const ETUSIVU_PAGE = 100;

/**
 * What `checkArticle` found and did. Nothing new is shown for any of these:
 * a fresh copy replaces the text with the usual "Sivu päivitetty", and a
 * checked list follows the usual rules.
 *
 * - `no-list`: not opened from a list, or the list doesn't have the page.
 * - `skipped`: no network copy to judge (error, 404, offline, device copy) or
 *   the proxy's old copy; or the fresh request ended so.
 * - `unknown`: the article has no heading to compare (`matchHeadline`).
 * - `same`: the article is the list's story. No extra request.
 * - `fresh-same`: it wasn't; the fresh copy is.
 * - `list-checked`: the fresh copy still isn't: the list was checked again.
 */
export type ArticleCheck =
  'no-list' | 'skipped' | 'unknown' | 'same' | 'fresh-same' | 'list-checked';

export interface FeedState {
  /** `loading`: no list yet (skeleton). `ready`: `items` is the list. `error`: no index page at all. */
  status: 'loading' | 'ready' | 'error';
  /** The stories, in feed order. Fixed until `refresh()`. */
  items: readonly FeedItem[];
  /** First paragraph by page number; a missing page is still loading (see `itemIngress`). */
  ingress: Readonly<Record<number, LeadIngress>>;
  /** When the oldest index page shown was fetched ("Päivitetty 14:32"). Null without a list. */
  updatedAt: Date | null;
  /** Some index page couldn't be fetched, so a saved copy or nothing is shown for it. */
  offline: boolean;
  /** Some index page is the proxy's last good copy because Yle didn't answer (D11). */
  stale: boolean;
  /** Why the feed has no list (`error` only). */
  reason: PageErrorReason | null;
  /** The list is being built or refreshed (not set by quiet checks). */
  refreshing: boolean;
  /** A checked list differs from the one shown and waits for "Päivitä lista" (D39 A). */
  hasUpdate: boolean;
}

export interface Visible {
  first: number;
  last: number;
}

export interface Neighbours {
  previous: FeedItem | null;
  next: FeedItem | null;
}

export interface FeedStore {
  getState(id: ListId): FeedState;
  /**
   * Builds the feed if it has no snapshot yet and calls `listener` on every
   * change. Etusivu is never built here; it shows what `registerList` gave.
   */
  subscribe(id: ListId, listener: () => void): () => void;
  /** Builds a new snapshot from fresh index pages. Joins one under way. Never rejects. */
  refresh(id: FeedId): Promise<void>;
  /**
   * Quietly checks every list on screen that is older than its limit (D39 A).
   * `awayMs`: how long the app was in the background before this (0 for a timer).
   */
  revalidate(awayMs?: number): void;
  /** Shows the list that waits behind "Päivitä lista" (`hasUpdate`). */
  applyUpdate(id: FeedId): void;
  /**
   * The list is the screen in front until the returned function is called.
   * Checks it now if it is past its limit.
   */
  focus(id: FeedId): () => void;
  /** The items on screen (indexes into `items`); first paragraphs load for them + `AHEAD`. */
  setVisible(id: ListId, first: number, last: number): void;
  visible(id: ListId): Visible;
  setScrollY(id: FeedId, y: number): void;
  /** The saved scroll position, 0 if none. */
  scrollY(id: FeedId): number;
  /**
   * Sets Etusivu's items (lead, then the groups) for its first paragraphs and
   * its articles' footer. `updatedAt` is page 100's time (for offline copies).
   */
  registerList(id: 'etusivu', items: readonly FeedItem[], updatedAt?: Date | null): void;
  /** The stories before and after `page` in a list; null if the list or the page isn't known. */
  neighbours(id: string, page: number): Neighbours | null;
  /** The list's own item for `page` (its section and headline); null if unknown. */
  itemOf(id: string, page: number): FeedItem | null;
  /**
   * Article `page` was opened from list `id`: checks the two against each
   * other (D39 C). Call once per opening. Never rejects.
   */
  checkArticle(id: string, page: number): Promise<ArticleCheck>;
}

export interface FeedStoreOptions {
  source: PageSource;
  /** Milliseconds, like Date.now. */
  now?: () => number;
}

/** What to show under an item's headline. */
export function itemIngress(state: FeedState, page: number): LeadIngress {
  return state.ingress[page] ?? LOADING_INGRESS;
}

export function isListId(id: string): id is ListId {
  return id === 'etusivu' || (FEED_IDS as readonly string[]).includes(id);
}

const LOADING_INGRESS: LeadIngress = { kind: 'loading' };
/** Service items (D40) are tables: headline only, never asked for. */
const NO_INGRESS: LeadIngress = { kind: 'none' };

const INITIAL: FeedState = {
  status: 'loading',
  items: [],
  ingress: {},
  updatedAt: null,
  offline: false,
  stale: false,
  reason: null,
  refreshing: false,
  hasUpdate: false,
};

const FAILED: PageState = {
  status: 'error',
  page: null,
  updatedAt: null,
  offline: false,
  stale: false,
  reason: 'offline',
  refreshing: false,
  background: false,
  fromDevice: false,
};

/** The page source has finished: a network answer, or a failure (with or without a copy). */
function isSettled(s: PageState): boolean {
  return !s.refreshing && s.status !== 'loading';
}

/** Waits for page `n` to settle, starting a load if the page source needs one. */
function waitSettled(source: PageSource, n: number): Promise<PageState> {
  return new Promise((resolve) => {
    let done = false;
    let off: (() => void) | null = null;
    const finish = (s: PageState) => {
      done = true;
      try {
        off?.();
      } catch {
        // nothing to undo
      }
      resolve(s);
    };
    const check = () => {
      if (done) return;
      let s: PageState;
      try {
        s = source.getSnapshot(n);
      } catch {
        finish(FAILED);
        return;
      }
      if (isSettled(s)) finish(s);
    };
    try {
      // The page source may call `check` before `subscribe` returns.
      off = source.subscribe(n, check);
    } catch {
      finish(FAILED);
      return;
    }
    if (done) off();
    else check();
  });
}

interface Feed {
  id: ListId;
  state: FeedState;
  listeners: Set<() => void>;
  building: Promise<void> | null;
  /** A quiet check under way. */
  checking: Promise<void> | null;
  /** Clock time of the index pages the shown list was last checked against. */
  checkedAt: number | null;
  /** The checked list waiting behind "Päivitä lista". */
  pending: FeedState | null;
  /** The app was in the background over `LONG_AWAY_MS` since the last check. */
  longAway: boolean;
  /** Where the list was when "away" started: scrolling away from there ends it. */
  awayFromY: number;
  /** Screens in front showing this feed (`focus`). */
  focused: number;
  visible: Visible;
  scrollY: number;
}

const keyOf = storyKey;

/** A feed is as old as allowed when its quickest index page is. */
const limitOf = (id: FeedId) => Math.min(...FEED_PAGES[id].map(pageLimitMs));

/** Feeds are built from their index pages; Etusivu is given its items. */
const isBuildable = (f: Feed): f is Feed & { id: FeedId } => f.id !== 'etusivu';

export function createFeedStore({ source, now = Date.now }: FeedStoreOptions): FeedStore {
  const feeds = new Map<ListId, Feed>();
  /** Lists, most recently shown first: their windows load in this order. */
  let order: ListId[] = [];
  /** The last copy of each index page a snapshot was built from, and when it came. */
  const captured = new Map<number, { state: PageState; at: number }>();
  /** First paragraphs taken, by `keyOf`. */
  const known = new Map<string, LeadIngress>();
  /** Keys taken from a failure or an offline copy: asked again after a refresh. */
  const retry = new Set<string>();
  const inFlight = new Set<string>();

  function listItems(id: string): readonly FeedItem[] | null {
    if (!isListId(id)) return null;
    const f = feeds.get(id);
    return f && f.state.status === 'ready' ? f.state.items : null;
  }

  function feed(id: ListId): Feed {
    let f = feeds.get(id);
    if (!f) {
      f = {
        id,
        state: INITIAL,
        listeners: new Set(),
        building: null,
        checking: null,
        checkedAt: null,
        pending: null,
        longAway: false,
        awayFromY: 0,
        focused: 0,
        visible: { first: 0, last: 0 },
        scrollY: 0,
      };
      feeds.set(id, f);
    }
    return f;
  }

  function update(f: Feed, next: FeedState) {
    f.state = next;
    for (const listener of [...f.listeners]) {
      try {
        listener();
      } catch {
        // a broken screen must not stop the others
      }
    }
  }

  function show(id: ListId) {
    order = [id, ...order.filter((o) => o !== id)];
  }

  function ingressFor(items: readonly FeedItem[]): Record<number, LeadIngress> {
    const out: Record<number, LeadIngress> = {};
    for (const item of items) {
      const value = item.service ? NO_INGRESS : known.get(keyOf(item));
      if (value) out[item.page] = value;
    }
    return out;
  }

  /** Items that failed or came from an offline copy are asked again. */
  function forgetRetries(items: readonly FeedItem[]) {
    for (const item of items) {
      const key = keyOf(item);
      if (retry.delete(key)) known.delete(key);
    }
  }

  /** Shows `next` in place of the list on screen. */
  function replace(f: Feed, next: FeedState, isRefresh: boolean) {
    if (isRefresh) forgetRetries(next.items);
    f.pending = null;
    if (f.state.status === 'ready') f.scrollY = 0;
    update(f, { ...next, ingress: ingressFor(next.items), hasUpdate: false });
    pump();
  }

  /**
   * Turns the settled index pages into the feed's new snapshot. A `check`
   * of a list on screen compares first (see the rules at the top).
   */
  function apply(
    f: Feed & { id: FeedId },
    states: readonly PageState[],
    mode: 'build' | 'refresh' | 'check',
  ) {
    const isRefresh = mode !== 'build';
    const numbers = FEED_PAGES[f.id];
    const used: Record<number, Page> = {};
    let any = false;
    let offline = false;
    let stale = false;
    let failed = false;
    let reason: PageErrorReason | null = null;
    let updatedAt: Date | null = null;
    let oldest: number | null = null;

    numbers.forEach((n, i) => {
      let s = states[i] ?? FAILED;
      if (!s.page || s.offline) failed = true;
      const before = captured.get(n);
      if (s.page) {
        // A reused copy keeps the time it first came.
        if (before?.state !== s) captured.set(n, { state: s, at: now() });
      } else if (before?.state.page) {
        // Failed, or a "not found" glitch: keep the copy the app already had.
        s = { ...before.state, offline: true };
      }
      if (!s.page) {
        offline = true;
        reason ??= s.reason;
        return;
      }
      any = true;
      used[n] = s.page;
      if (s.offline) offline = true;
      else if (s.stale) stale = true;
      if (s.updatedAt && (!updatedAt || s.updatedAt < updatedAt)) updatedAt = s.updatedAt;
      const at = captured.get(n)?.at;
      if (at !== undefined && (oldest === null || at < oldest)) oldest = at;
    });

    if (mode === 'check' && f.state.status === 'ready') {
      // Couldn't reach Yle or the proxy: keep the list, say so, try again later.
      if (failed) {
        update(f, { ...f.state, offline: true });
        return;
      }
      f.checkedAt = oldest ?? now();
      const items = feedList(f.id, used);
      const decision = listUpdate(f.state.items, items, {
        longAway: f.longAway,
        atTop: isAtTop(f.scrollY),
      });
      f.longAway = false;
      const next: FeedState = {
        status: 'ready',
        items,
        ingress: {},
        updatedAt,
        offline,
        stale,
        reason: null,
        refreshing: f.state.refreshing,
        hasUpdate: false,
      };
      if (decision === 'same') {
        f.pending = null;
        update(f, { ...f.state, updatedAt, offline, stale, hasUpdate: false });
      } else if (decision === 'offer') {
        f.pending = next;
        update(f, { ...f.state, hasUpdate: true });
      } else {
        replace(f, next, true);
      }
      return;
    }

    if (!any) {
      if (f.state.status === 'ready') {
        update(f, { ...f.state, offline: true, refreshing: false });
      } else {
        update(f, { ...INITIAL, status: 'error', reason: reason ?? 'offline' });
      }
      return;
    }

    if (!failed || f.checkedAt === null) f.checkedAt = oldest ?? now();
    f.longAway = false;
    const items = feedList(f.id, used);
    replace(
      f,
      {
        status: 'ready',
        items,
        ingress: {},
        updatedAt,
        offline,
        stale,
        reason: null,
        refreshing: false,
        hasUpdate: false,
      },
      isRefresh,
    );
  }

  /** The shown list is older than its limit. */
  function due(f: Feed & { id: FeedId }): boolean {
    return f.checkedAt === null || now() - f.checkedAt >= limitOf(f.id);
  }

  /**
   * Re-reads the index pages quietly through the page source and compares
   * (D39 A). `maxAgeMs` 0 asks the proxy even for a copy inside its limit.
   */
  function check(f: Feed & { id: FeedId }, maxAgeMs?: number): Promise<void> {
    if (f.building) return f.building;
    if (f.checking) return f.checking;
    const states = FEED_PAGES[f.id].map(async (n) => {
      try {
        await source.revalidate(n, maxAgeMs);
        return source.getSnapshot(n);
      } catch {
        return FAILED;
      }
    });
    f.checking = Promise.all(states)
      .then((s) => apply(f, s, 'check'))
      .catch(() => undefined)
      .finally(() => {
        f.checking = null;
      });
    return f.checking;
  }

  function build(f: Feed & { id: FeedId }, isRefresh: boolean): Promise<void> {
    if (f.building) return f.building;
    const numbers = FEED_PAGES[f.id];

    /** A copy another feed was just built from (not on refresh, not if old). */
    const reusable = (n: number): PageState | null => {
      const c = captured.get(n);
      return !isRefresh && c?.state.page && now() - c.at <= REUSE_INDEX_MS ? c.state : null;
    };

    // Every index page just read for another feed: no request, no skeleton.
    const copies = numbers.map(reusable);
    if (copies.every((c) => c !== null)) {
      apply(f, copies, 'build');
      return Promise.resolve();
    }

    update(f, { ...f.state, refreshing: true });
    const loads = numbers.map((n) => {
      const copy = reusable(n);
      if (copy) return Promise.resolve(copy);
      if (isRefresh) {
        try {
          void source.refresh(n).catch(() => undefined);
        } catch {
          // waitSettled below reads whatever state the page is in
        }
      }
      return waitSettled(source, n);
    });
    f.building = Promise.all(loads)
      .then((states) => apply(f, states, isRefresh ? 'refresh' : 'build'))
      .catch(() => update(f, { ...f.state, refreshing: false }))
      .finally(() => {
        f.building = null;
      });
    return f.building;
  }

  /** Records a first paragraph and shows it in every feed that lists the item. */
  function take(item: FeedItem, value: LeadIngress, again: boolean) {
    const key = keyOf(item);
    known.set(key, value);
    if (again) retry.add(key);
    else retry.delete(key);
    for (const f of feeds.values()) {
      if (!f.state.items.some((i) => !i.service && keyOf(i) === key)) continue;
      update(f, { ...f.state, ingress: { ...f.state.ingress, [item.page]: value } });
    }
  }

  function load(item: FeedItem, feedUpdatedAt: Date | null) {
    const key = keyOf(item);
    inFlight.add(key);
    void waitSettled(source, item.page).then((s) => {
      inFlight.delete(key);
      let value: LeadIngress;
      try {
        value = leadIngress(s, item.headline);
      } catch {
        value = { kind: 'none' };
      }
      // Offline, a copy saved at another time may be another story, unless
      // its own heading is the headline the list shows.
      const otherTime =
        s.offline &&
        feedUpdatedAt !== null &&
        (s.updatedAt === null ||
          Math.abs(s.updatedAt.getTime() - feedUpdatedAt.getTime()) > OFFLINE_COPY_SLACK_MS);
      if (otherTime && !(s.page && matchHeadline(item.headline, pageHeadline(s.page)) === 'same')) {
        value = { kind: 'none' };
      }
      take(item, value, s.offline || !s.page);
      pump();
    });
  }

  /** Starts first-paragraph requests for the visible windows, up to MAX_IN_FLIGHT. */
  function pump() {
    for (const id of order) {
      const f = feeds.get(id);
      if (!f || f.state.status !== 'ready') continue;
      const { items } = f.state;
      const end = Math.min(items.length - 1, f.visible.last + AHEAD);
      for (let i = Math.max(0, f.visible.first); i <= end; i++) {
        if (inFlight.size >= MAX_IN_FLIGHT) return;
        const item = items[i]!;
        const key = keyOf(item);
        if (item.service || known.has(key) || inFlight.has(key)) continue;
        load(item, f.state.updatedAt);
      }
    }
  }

  /** The list is older than the article opened from it: check it now (D39 C). */
  async function recheck(id: ListId): Promise<void> {
    try {
      if (id === 'etusivu') {
        // The front page holds page 100 and decides how a new copy is shown.
        await source.revalidate(ETUSIVU_PAGE, 0);
        return;
      }
      const f = feed(id);
      if (isBuildable(f) && f.state.status === 'ready') await check(f, 0);
    } catch {
      // the list stays as it is
    }
  }

  /** The article's network copy, compared with the list's headline. */
  function judge(item: FeedItem, s: PageState): 'skipped' | 'unknown' | 'same' | 'differs' {
    if (s.status !== 'ready' || !s.page || s.offline || s.stale || s.fromDevice) return 'skipped';
    return matchHeadline(item.headline, pageHeadline(s.page));
  }

  function snapshot(n: number): PageState {
    try {
      return source.getSnapshot(n);
    } catch {
      return FAILED;
    }
  }

  async function checkArticle(id: string, page: number): Promise<ArticleCheck> {
    try {
      const listed = isListId(id) ? listItems(id)?.find((i) => i.page === page) : undefined;
      if (!listed) return 'no-list';
      // Settled already (the article screen loaded it, or the list's first paragraph
      // did): judge that copy. Subscribing again would ask again after an error.
      const shown = snapshot(page);
      const first = judge(listed, isSettled(shown) ? shown : await waitSettled(source, page));
      if (first !== 'differs') return first;
      await source.fetchFresh(page);
      const again = snapshot(page);
      const second = judge(listed, again);
      if (second === 'same') {
        // The first paragraph came from the other story's copy: take it from this one.
        take(listed, leadIngress(again, listed.headline), false);
        return 'fresh-same';
      }
      if (second !== 'differs') return second;
      await recheck(id as ListId);
      return 'list-checked';
    } catch {
      return 'skipped';
    }
  }

  function applyUpdate(f: Feed) {
    if (f.pending) replace(f, { ...f.pending, refreshing: f.state.refreshing }, true);
  }

  return {
    getState: (id) => feeds.get(id)?.state ?? INITIAL,
    subscribe(id, listener) {
      const f = feed(id);
      f.listeners.add(listener);
      show(id);
      // A feed with no list (never built, or nothing could be loaded) is built
      // again; a list is never rebuilt by coming back to it, only checked.
      if (isBuildable(f) && f.state.status !== 'ready' && !f.building) {
        void build(f, f.state.status === 'error');
      } else {
        if (isBuildable(f) && f.state.status === 'ready' && due(f)) void check(f);
        pump();
      }
      return () => {
        f.listeners.delete(listener);
      };
    },
    refresh: (id) => build(feed(id) as Feed & { id: FeedId }, true),
    revalidate(awayMs = 0) {
      for (const f of feeds.values()) {
        if (!isBuildable(f)) continue;
        if (awayMs > LONG_AWAY_MS && f.state.status === 'ready') {
          f.longAway = true;
          f.awayFromY = f.scrollY;
        }
        if (f.focused > 0 && f.state.status === 'ready' && due(f)) void check(f);
      }
    },
    applyUpdate: (id) => applyUpdate(feed(id)),
    focus(id) {
      const f = feed(id) as Feed & { id: FeedId };
      f.focused += 1;
      if (f.state.status === 'ready' && due(f)) void check(f);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        f.focused -= 1;
      };
    },
    setVisible(id, first, last) {
      if (!Number.isFinite(first) || !Number.isFinite(last)) return;
      const f = feed(id);
      const a = Math.max(0, Math.floor(Math.min(first, last)));
      const b = Math.max(0, Math.floor(Math.max(first, last)));
      f.visible = { first: a, last: b };
      show(id);
      pump();
    },
    visible: (id) => feed(id).visible,
    setScrollY(id, y) {
      if (!Number.isFinite(y)) return;
      const f = feed(id);
      const next = Math.max(0, y);
      // The reader scrolled: reading again, so a later change is offered, not swapped in.
      // Measured from where it was on return, so a slow drag in small steps counts too.
      if (Math.abs(next - f.awayFromY) > AT_TOP_PX) f.longAway = false;
      f.scrollY = next;
      // Scrolling to the top yourself does what "Päivitä lista" does.
      if (isAtTop(f.scrollY)) applyUpdate(f);
    },
    scrollY: (id) => feeds.get(id)?.scrollY ?? 0,
    registerList(id, items, updatedAt = null) {
      const f = feed(id);
      const list = [...items];
      forgetRetries(list);
      update(f, {
        ...INITIAL,
        status: 'ready',
        items: list,
        ingress: ingressFor(list),
        updatedAt,
      });
      pump();
    },
    checkArticle,
    itemOf(id, page) {
      return listItems(id)?.find((item) => item.page === page) ?? null;
    },
    neighbours(id, page) {
      if (!isListId(id)) return null;
      const items = listItems(id);
      if (!items) return null;
      const i = items.findIndex((item) => item.page === page);
      if (i === -1) return null;
      return { previous: items[i - 1] ?? null, next: items[i + 1] ?? null };
    },
  };
}
