import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { PageErrorReason } from '../api/client';
import { createPageSource, type PageSource, type PageState } from '../data/pageSource';
import { frontPage, ingress } from '../front/frontPage';
import type { Page } from '../parser/model';
import { normalize } from '../parser/normalize';
import { feedList, type FeedItem } from './feedList';
import { etusivuItems } from './footer';
import {
  AHEAD,
  createFeedStore,
  itemIngress,
  MAX_IN_FLIGHT,
  OFFLINE_COPY_SLACK_MS,
  REUSE_INDEX_MS,
  type FeedStore,
} from './feedStore';

const here = fileURLToPath(new URL('.', import.meta.url));
const rawOf = (n: number): unknown =>
  JSON.parse(readFileSync(resolve(here, `../../fixtures/pages/${n}.json`), 'utf8'));

function load(n: number): Page {
  const r = normalize(rawOf(n));
  if (!r.ok) throw new Error(`fixture ${n} does not normalise`);
  return r.page;
}

const ARTICLE = load(105);
const ARTICLE_TEXT = ingress(ARTICLE)!;
const KOTIMAA = feedList('kotimaa', { 102: load(102) });
const ULKOMAAT = feedList('ulkomaat', { 130: load(130) });
const pagesOf = (items: readonly { page: number }[]) => items.map((i) => i.page);

const T0 = new Date('2026-10-24T09:00:00.000Z');
const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/** Lets promise callbacks run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

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

/**
 * A page source the test drives by hand. `subscribe` starts a request unless
 * one is under way or the page answered recently (like the real one's 15 s);
 * the test answers it with `answer` or `fail`.
 */
class FakeSource implements PageSource {
  states = new Map<number, PageState>();
  listeners = new Map<number, Set<() => void>>();
  pending = new Set<number>();
  recent = new Set<number>();
  started: number[] = [];
  peak = 0;
  throwsOn = new Set<number>();

  getSnapshot(n: number): PageState {
    return this.states.get(n) ?? INITIAL;
  }

  subscribe(n: number, listener: () => void): () => void {
    if (this.throwsOn.has(n)) throw new Error('broken');
    let set = this.listeners.get(n);
    if (!set) this.listeners.set(n, (set = new Set()));
    set.add(listener);
    if (!this.pending.has(n) && !this.recent.has(n)) this.start(n);
    return () => set.delete(listener);
  }

  refresh(n: number): Promise<void> {
    if (!this.pending.has(n)) this.start(n);
    return Promise.resolve();
  }

  /** Quiet checks asked for, by page. */
  revalidated: number[] = [];
  private waiters = new Map<number, (() => void)[]>();

  /** Like the real one: a recent page answers at once, else a request the test finishes. */
  revalidate(n: number): Promise<void> {
    this.revalidated.push(n);
    if (this.recent.has(n) && !this.pending.has(n)) return Promise.resolve();
    if (!this.pending.has(n)) this.start(n);
    return new Promise((resolve) => {
      this.waiters.set(n, [...(this.waiters.get(n) ?? []), resolve]);
    });
  }

  revalidateShown(): void {}

  fetchFresh(n: number): Promise<void> {
    return this.revalidate(n);
  }

  focus(): () => void {
    return () => undefined;
  }

  private done(n: number) {
    const list = this.waiters.get(n) ?? [];
    this.waiters.delete(n);
    for (const resolve of list) resolve();
  }

  /** Pages with a request under way that nobody but the test will finish. */
  get inFlight(): number[] {
    return [...this.pending];
  }

  private start(n: number) {
    this.pending.add(n);
    this.started.push(n);
    this.peak = Math.max(this.peak, this.pending.size);
    this.set(n, { refreshing: true });
  }

  /** Shows a device copy while the request is still under way. */
  device(n: number, page: Page, updatedAt = T0) {
    this.set(n, { status: 'ready', page, updatedAt, offline: false });
  }

  answer(n: number, page: Page, updatedAt = T0, stale = false) {
    this.pending.delete(n);
    this.recent.add(n);
    this.set(n, {
      status: 'ready',
      page,
      updatedAt,
      offline: false,
      stale,
      reason: null,
      refreshing: false,
    });
    this.done(n);
  }

  /** The request failed: an offline copy if one is shown, else an error. */
  fail(n: number, reason: PageErrorReason = 'offline') {
    this.pending.delete(n);
    const s = this.getSnapshot(n);
    if (s.page && reason !== 'not-found') this.set(n, { offline: true, reason, refreshing: false });
    else this.set(n, { ...INITIAL, status: 'error', reason });
    this.done(n);
  }

  /** A change the feed must not follow (another screen refreshed the page). */
  background(n: number, page: Page) {
    this.set(n, { status: 'ready', page, updatedAt: minutes(T0, 5), refreshing: false });
  }

  expire() {
    this.recent.clear();
  }

  private set(n: number, patch: Partial<PageState>) {
    this.states.set(n, { ...this.getSnapshot(n), ...patch });
    for (const l of [...(this.listeners.get(n) ?? [])]) l();
  }
}

function setup() {
  const src = new FakeSource();
  const clock = { now: T0.getTime() };
  const store = createFeedStore({ source: src, now: () => clock.now });
  return { src, store, clock };
}

/** Builds Kotimaa from the real page 102 and answers no article yet. */
async function kotimaa(src: FakeSource, store: FeedStore) {
  const off = store.subscribe('kotimaa', () => undefined);
  src.answer(102, load(102));
  await settle();
  return off;
}

/** Answers every article request under way with page 105's text. */
async function answerArticles(src: FakeSource) {
  for (const n of src.inFlight) src.answer(n, ARTICLE);
  await settle();
}

const articleRequests = (src: FakeSource) => src.started.filter((n) => n !== 102 && n !== 130);

describe('building the snapshot', () => {
  it('waits for the network answer, not the device copy', async () => {
    const { src, store } = setup();
    store.subscribe('kotimaa', () => undefined);
    expect(store.getState('kotimaa')).toMatchObject({ status: 'loading', refreshing: true });

    src.device(102, load(130)); // an old copy while the request is under way
    await settle();
    expect(store.getState('kotimaa').status).toBe('loading');

    src.answer(102, load(102));
    await settle();
    const s = store.getState('kotimaa');
    expect(s).toMatchObject({ status: 'ready', offline: false, refreshing: false });
    expect(pagesOf(s.items)).toEqual(pagesOf(KOTIMAA));
    expect(s.updatedAt).toEqual(T0);
  });

  it('builds Uutiset from both index pages, Kotimaa first', async () => {
    const { src, store } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(130, load(130));
    await settle();
    expect(store.getState('uutiset').status).toBe('loading');
    src.answer(102, load(102), minutes(T0, 1));
    await settle();
    const s = store.getState('uutiset');
    expect(pagesOf(s.items)).toEqual([...pagesOf(KOTIMAA), ...pagesOf(ULKOMAAT)]);
    expect(s.updatedAt).toEqual(T0); // the older of the two
  });

  it('keeps the other half when one index page fails', async () => {
    const { src, store } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    src.fail(130);
    await settle();
    const s = store.getState('uutiset');
    expect(s).toMatchObject({ status: 'ready', offline: true });
    expect(pagesOf(s.items)).toEqual(pagesOf(KOTIMAA));
  });

  it('is marked stale when the proxy gave its last good copy of an index page', async () => {
    const { src, store } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    src.answer(130, load(130), T0, true);
    await settle();
    expect(store.getState('uutiset')).toMatchObject({
      status: 'ready',
      offline: false,
      stale: true,
    });
  });

  it('is not marked stale when every index page is fresh', async () => {
    const { src, store } = setup();
    store.subscribe('talous', () => undefined);
    src.answer(160, load(160));
    await settle();
    expect(store.getState('talous')).toMatchObject({ status: 'ready', stale: false });
  });

  it('is offline, not stale, when the stale copy is a device copy shown offline', async () => {
    const { src, store } = setup();
    store.subscribe('talous', () => undefined);
    src.states.set(160, {
      status: 'ready',
      page: load(160),
      updatedAt: T0,
      offline: false,
      stale: true,
      reason: null,
      refreshing: true,
      background: false,
      fromDevice: false,
    });
    src.fail(160);
    await settle();
    expect(store.getState('talous')).toMatchObject({ offline: true, stale: false });
  });

  it('is an error only when no index page could be loaded', async () => {
    const { src, store } = setup();
    store.subscribe('talous', () => undefined);
    src.fail(160);
    await settle();
    expect(store.getState('talous')).toMatchObject({
      status: 'error',
      reason: 'offline',
      items: [],
    });
  });

  it('builds the Kotimaa chip from the copy Uutiset was built from, with no request', async () => {
    const { src, store } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    src.answer(130, load(130));
    await settle();
    src.expire();
    const before = src.started.length;
    store.subscribe('kotimaa', () => undefined);
    const s = store.getState('kotimaa'); // at once, no skeleton
    expect(s.status).toBe('ready');
    expect(pagesOf(s.items)).toEqual(pagesOf(KOTIMAA));
    expect(src.started.filter((n) => n === 102)).toHaveLength(1);
    expect(src.started.length - before).toBeLessThanOrEqual(MAX_IN_FLIGHT);
  });

  it('fetches again for the chip when the copy Uutiset was built from is old', async () => {
    const { src, store, clock } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    src.answer(130, load(130));
    await settle();
    src.expire();
    clock.now += REUSE_INDEX_MS + 60_000; // the app was left open overnight, say

    store.subscribe('kotimaa', () => undefined);
    expect(store.getState('kotimaa').status).toBe('loading'); // waits for the network
    expect(src.started.filter((n) => n === 102)).toHaveLength(2);
    src.answer(102, load(130), minutes(T0, 11));
    await settle();
    const s = store.getState('kotimaa');
    expect(pagesOf(s.items)).toEqual(pagesOf(feedList('kotimaa', { 102: load(130) })));
    expect(s.updatedAt).toEqual(minutes(T0, 11));
  });

  it('is built even if the screen goes away before the index page answers', async () => {
    const { src, store } = setup();
    const off = store.subscribe('kotimaa', () => undefined);
    off();
    src.answer(102, load(102));
    await settle();
    expect(store.getState('kotimaa').status).toBe('ready');
    src.expire();
    store.subscribe('kotimaa', () => undefined);
    expect(pagesOf(store.getState('kotimaa').items)).toEqual(pagesOf(KOTIMAA));
    expect(src.started.filter((n) => n === 102)).toHaveLength(1);
  });

  it('counts a page source that throws as a failure of that page only', async () => {
    const { src, store } = setup();
    src.throwsOn.add(130);
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    await settle();
    expect(store.getState('uutiset')).toMatchObject({ status: 'ready', offline: true });
  });
});

describe('the snapshot stays fixed', () => {
  it('does not follow page-source updates after it is built', async () => {
    const { src, store } = setup();
    let calls = 0;
    store.subscribe('kotimaa', () => calls++);
    src.answer(102, load(102));
    await settle();
    const built = store.getState('kotimaa');
    const callsAfterBuild = calls;

    src.background(102, load(130));
    await settle();
    expect(store.getState('kotimaa')).toBe(built);
    expect(calls).toBe(callsAfterBuild);
  });

  it('survives the screen going away and coming back, with no new request', async () => {
    const { src, store } = setup();
    const off = await kotimaa(src, store);
    const built = store.getState('kotimaa');
    store.setScrollY('kotimaa', 640);
    store.setVisible('kotimaa', 3, 6);
    off();

    src.expire();
    src.background(102, load(130));
    const index = src.started.filter((n) => n === 102).length;
    store.subscribe('kotimaa', () => undefined);
    expect(store.getState('kotimaa').items).toBe(built.items);
    expect(src.started.filter((n) => n === 102)).toHaveLength(index);
    expect(store.scrollY('kotimaa')).toBe(640);
    expect(store.visible('kotimaa')).toEqual({ first: 3, last: 6 });
  });

  it('keeps scroll positions per feed', () => {
    const { store } = setup();
    store.setScrollY('kotimaa', 100);
    store.setScrollY('uutiset', 250);
    expect(store.scrollY('kotimaa')).toBe(100);
    expect(store.scrollY('uutiset')).toBe(250);
    expect(store.scrollY('talous')).toBe(0);
  });
});

describe('refresh', () => {
  it('replaces the list with fresh index pages', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    const done = store.refresh('kotimaa');
    expect(store.getState('kotimaa')).toMatchObject({ status: 'ready', refreshing: true });
    expect(pagesOf(store.getState('kotimaa').items)).toEqual(pagesOf(KOTIMAA)); // old list meanwhile
    src.answer(102, load(130), minutes(T0, 5));
    await done;
    const s = store.getState('kotimaa');
    expect(pagesOf(s.items)).toEqual(pagesOf(feedList('kotimaa', { 102: load(130) })));
    expect(s).toMatchObject({ refreshing: false, offline: false });
    expect(s.updatedAt).toEqual(minutes(T0, 5));
  });

  it('fetches again even when the index page answered a moment ago', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    void store.refresh('kotimaa');
    expect(src.started.filter((n) => n === 102)).toHaveLength(2);
  });

  it('joins the first build when that is still loading', async () => {
    const { src, store } = setup();
    store.subscribe('kotimaa', () => undefined);
    const done = store.refresh('kotimaa');
    expect(store.refresh('kotimaa')).toBe(done);
    expect(src.started.filter((n) => n === 102)).toHaveLength(1);
    src.answer(102, load(102));
    await done;
    expect(store.getState('kotimaa')).toMatchObject({ status: 'ready', refreshing: false });
    expect(pagesOf(store.getState('kotimaa').items)).toEqual(pagesOf(KOTIMAA));
  });

  it('joins a refresh already under way', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    const a = store.refresh('kotimaa');
    const b = store.refresh('kotimaa');
    expect(a).toBe(b);
  });

  it('keeps the list, marked offline, when every index page fails', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    const items = store.getState('kotimaa').items;
    src.states.delete(102); // the page source forgot it
    const done = store.refresh('kotimaa');
    src.fail(102);
    await done;
    expect(store.getState('kotimaa')).toMatchObject({
      status: 'ready',
      offline: true,
      refreshing: false,
    });
    expect(store.getState('kotimaa').items).toEqual(items);
  });

  it('keeps Ulkomaat from the copy it had when 130 briefly answers "not found"', async () => {
    const { src, store } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    src.answer(130, load(130));
    await settle();
    const items = store.getState('uutiset').items;

    const done = store.refresh('uutiset');
    src.answer(102, load(102), minutes(T0, 5));
    src.fail(130, 'not-found');
    await done;
    const s = store.getState('uutiset');
    expect(s.items).toEqual(items); // both halves still there
    expect(s).toMatchObject({ status: 'ready', offline: true, refreshing: false });
    expect(s.updatedAt).toEqual(T0); // the kept copy's time
  });

  it('keeps the list, marked offline, when every index page answers "not found"', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    const items = store.getState('kotimaa').items;
    const done = store.refresh('kotimaa');
    src.fail(102, 'not-found');
    await done;
    expect(store.getState('kotimaa')).toMatchObject({ status: 'ready', offline: true });
    expect(store.getState('kotimaa').items).toEqual(items);
  });

  it('retries a feed that had nothing when its screen comes back', async () => {
    const { src, store } = setup();
    const off = store.subscribe('talous', () => undefined);
    src.fail(160);
    await settle();
    off();
    store.subscribe('talous', () => undefined);
    src.answer(160, load(160));
    await settle();
    expect(store.getState('talous').status).toBe('ready');
  });
});

describe('first paragraphs', () => {
  it(`loads the visible items + ${AHEAD}, in list order, ${MAX_IN_FLIGHT} at a time`, async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    // Nothing reported yet: the first item counts as visible.
    expect(articleRequests(src)).toEqual(pagesOf(KOTIMAA).slice(0, MAX_IN_FLIGHT));
    for (let i = 0; i < 5; i++) await answerArticles(src);
    expect(articleRequests(src)).toEqual(pagesOf(KOTIMAA).slice(0, 1 + AHEAD));
    expect(src.peak).toBeLessThanOrEqual(MAX_IN_FLIGHT + 1); // + the index page
  });

  it('never has more than 4 article requests at once', async () => {
    const { src, store } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    src.answer(130, load(130));
    await settle();
    store.setVisible('uutiset', 0, 17);
    expect(src.inFlight).toHaveLength(MAX_IN_FLIGHT);
    while (src.inFlight.length > 0) {
      src.answer(src.inFlight[0]!, ARTICLE);
      await settle();
      expect(src.inFlight.length).toBeLessThanOrEqual(MAX_IN_FLIGHT);
    }
    expect(src.peak).toBe(MAX_IN_FLIGHT);
    expect(articleRequests(src)).toHaveLength(18);
  });

  it('grows the window as the visible items move, and never asks twice', async () => {
    const { src, store } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    src.answer(130, load(130));
    await settle();
    const all = pagesOf(store.getState('uutiset').items);
    for (let i = 0; i < 3; i++) await answerArticles(src);
    expect(articleRequests(src)).toEqual(all.slice(0, 7));

    store.setVisible('uutiset', 4, 7);
    for (let i = 0; i < 3; i++) await answerArticles(src);
    expect(articleRequests(src)).toEqual(all.slice(0, 7 + AHEAD + 1));

    store.setVisible('uutiset', 0, 2); // back up: everything there is known
    await settle();
    expect(articleRequests(src)).toEqual(all.slice(0, 7 + AHEAD + 1));
  });

  it('shows loading, then the first paragraph, without changing the items', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    const first = KOTIMAA[0]!.page;
    const items = store.getState('kotimaa').items;
    expect(itemIngress(store.getState('kotimaa'), first)).toEqual({ kind: 'loading' });
    src.answer(first, ARTICLE);
    await settle();
    expect(itemIngress(store.getState('kotimaa'), first)).toEqual({
      kind: 'text',
      text: ARTICLE_TEXT,
    });
    expect(store.getState('kotimaa').items).toBe(items);
  });

  it('shows only the headline for an item whose article fails, and the rest go on', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    const [a, b] = pagesOf(KOTIMAA);
    src.fail(a!, 'upstream');
    src.answer(b!, ARTICLE);
    await settle();
    const s = store.getState('kotimaa');
    expect(itemIngress(s, a!)).toEqual({ kind: 'none' });
    expect(itemIngress(s, b!).kind).toBe('text');
    expect(s.status).toBe('ready');
    expect(src.inFlight).toHaveLength(MAX_IN_FLIGHT); // the next ones started
  });

  it('counts a page source that throws for one article as that item failing', async () => {
    const { src, store } = setup();
    src.throwsOn.add(KOTIMAA[0]!.page);
    await kotimaa(src, store);
    expect(itemIngress(store.getState('kotimaa'), KOTIMAA[0]!.page)).toEqual({ kind: 'none' });
    expect(src.inFlight).toHaveLength(MAX_IN_FLIGHT);
  });

  it('is shared between feeds: the Kotimaa chip shows what Kaikki loaded', async () => {
    const { src, store } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    src.answer(130, load(130));
    await settle();
    await answerArticles(src);
    await answerArticles(src); // Kaikki's first 7 = Kotimaa's first 7
    const asked = articleRequests(src).length;
    expect(asked).toBe(1 + AHEAD);

    store.subscribe('kotimaa', () => undefined);
    const s = store.getState('kotimaa');
    for (const item of KOTIMAA.slice(0, 1 + AHEAD)) {
      expect(itemIngress(s, item.page).kind).toBe('text');
    }
    await settle();
    expect(articleRequests(src)).toHaveLength(asked);
  });

  it('keeps a first paragraph across refresh, and asks again for failed ones', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    const [a, b] = pagesOf(KOTIMAA);
    src.answer(a!, ARTICLE);
    src.fail(b!);
    await settle();
    await answerArticles(src);
    const before = articleRequests(src);

    const done = store.refresh('kotimaa');
    src.answer(102, load(102), minutes(T0, 5));
    await done;
    const again = articleRequests(src).slice(before.length);
    expect(again).toEqual([b]);
    expect(itemIngress(store.getState('kotimaa'), a!).kind).toBe('text');
  });

  it('asks again when a page number now carries another headline', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    await answerArticles(src);
    const before = articleRequests(src);
    // Page 103 now has a new story (same length, so the row stays 40 columns).
    const text = readFileSync(resolve(here, '../../fixtures/pages/102.json'), 'utf8');
    expect(text).toContain('103 Etelässä odotetaan');
    const r = normalize(JSON.parse(text.replaceAll('Etelässä odotetaan', 'Lännessä odotetaan')));
    if (!r.ok) throw new Error('edited 102 does not normalise');

    src.expire(); // a while later
    const done = store.refresh('kotimaa');
    src.answer(102, r.page, minutes(T0, 5));
    await done;
    expect(store.getState('kotimaa').items[0]?.headline).toMatch(/^Lännessä/);
    expect(itemIngress(store.getState('kotimaa'), 103)).toEqual({ kind: 'loading' });
    expect(articleRequests(src).slice(before.length)).toEqual([103]);
  });
});

describe('Etusivu first paragraphs', () => {
  const ETUSIVU = etusivuItems(frontPage(load(100)));

  it("asks for all of page 100's stories at once (5 on 21.10.2026: under visible + 6)", async () => {
    const { src, store } = setup();
    expect(ETUSIVU).toHaveLength(5);
    store.subscribe('etusivu', () => undefined);
    await settle();
    expect(src.started).toEqual([]); // nothing to build: no index page is asked for
    expect(store.getState('etusivu').status).toBe('loading');

    store.registerList('etusivu', ETUSIVU, T0);
    expect(store.getState('etusivu')).toMatchObject({ status: 'ready', items: ETUSIVU });
    await answerArticles(src);
    expect(src.started).toEqual(pagesOf(ETUSIVU));
    expect(src.peak).toBeLessThanOrEqual(MAX_IN_FLIGHT);
    expect(itemIngress(store.getState('etusivu'), ETUSIVU[0]!.page)).toEqual({
      kind: 'text',
      text: ARTICLE_TEXT,
    });
  });

  it(`a longer list loads the visible items + ${AHEAD}, ${MAX_IN_FLIGHT} at a time`, async () => {
    const { src, store } = setup();
    const long = [...KOTIMAA, ...ULKOMAAT];
    store.subscribe('etusivu', () => undefined);
    store.registerList('etusivu', long, T0);
    expect(src.started).toEqual(pagesOf(long).slice(0, MAX_IN_FLIGHT));
    for (let i = 0; i < 5; i++) await answerArticles(src);
    expect(src.started).toEqual(pagesOf(long).slice(0, 1 + AHEAD));

    store.setVisible('etusivu', 3, 5);
    for (let i = 0; i < 5; i++) await answerArticles(src);
    expect(src.started).toEqual(pagesOf(long).slice(0, 6 + AHEAD));
    expect(src.peak).toBeLessThanOrEqual(MAX_IN_FLIGHT);
  });

  it('shares first paragraphs with the feeds: a story already loaded is not asked again', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    await answerArticles(src);
    await answerArticles(src);
    const asked = src.started.length;
    const shared = KOTIMAA[0]!;
    store.subscribe('etusivu', () => undefined);
    store.registerList('etusivu', [shared], T0);
    await settle();
    expect(src.started).toHaveLength(asked);
    expect(itemIngress(store.getState('etusivu'), shared.page).kind).toBe('text');
  });

  it('a new copy of page 100 asks again for failed items only', async () => {
    const { src, store } = setup();
    const [a, b] = ETUSIVU;
    store.subscribe('etusivu', () => undefined);
    store.registerList('etusivu', [a!, b!], T0);
    src.answer(a!.page, ARTICLE);
    src.fail(b!.page, 'upstream');
    await settle();
    expect(itemIngress(store.getState('etusivu'), b!.page)).toEqual({ kind: 'none' });
    const before = src.started.length;

    store.registerList('etusivu', [a!, b!], minutes(T0, 1));
    await settle();
    expect(src.started.slice(before)).toEqual([b!.page]);
    expect(itemIngress(store.getState('etusivu'), a!.page).kind).toBe('text');
  });
});

describe('offline copies of articles', () => {
  async function offlineArticle(articleAt: Date, listed = KOTIMAA[0]!.page) {
    const { src, store } = setup();
    await kotimaa(src, store); // index answered at T0
    src.device(listed, ARTICLE, articleAt);
    src.fail(listed);
    await settle();
    return itemIngress(store.getState('kotimaa'), listed);
  }

  it('uses a copy saved around the same time as the index page', async () => {
    expect(await offlineArticle(minutes(T0, -2))).toEqual({ kind: 'text', text: ARTICLE_TEXT });
  });

  it('leaves out a copy much older than the index page (it may be another story)', async () => {
    const old = new Date(T0.getTime() - OFFLINE_COPY_SLACK_MS - 60_000);
    expect(await offlineArticle(old)).toEqual({ kind: 'none' });
  });

  it('leaves out a copy much newer than the index page (it may be another story)', async () => {
    const later = new Date(T0.getTime() + OFFLINE_COPY_SLACK_MS + 60_000);
    expect(await offlineArticle(later)).toEqual({ kind: 'none' });
  });

  it('uses a much older copy when its heading is the listed headline', async () => {
    // Page 105's article under the list row that says 105 (`Yksi kuoli Jyväskylän palossa`).
    const old = new Date(T0.getTime() - 12 * 60 * 60_000);
    expect(await offlineArticle(old, 105)).toEqual({ kind: 'text', text: ARTICLE_TEXT });
  });

  it('uses a copy saved a few minutes after the index page', async () => {
    expect(await offlineArticle(minutes(T0, 8))).toEqual({ kind: 'text', text: ARTICLE_TEXT });
  });
});

describe('offline build with the real page source', () => {
  it('uses the device copies and says so', async () => {
    const savedAt = new Date('2026-10-23T18:00:00.000Z');
    // Page 105 is the third story on 102; it was read before the connection went.
    const read = KOTIMAA.findIndex((i) => i.page === 105);
    const unread = KOTIMAA.findIndex((i) => i.page !== 105);
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThanOrEqual(AHEAD);
    const device = new Map<number, unknown>([
      [102, rawOf(102)],
      [105, rawOf(105)],
    ]);
    const src = createPageSource({
      fetchPage: () => Promise.resolve({ ok: false, reason: 'offline' }),
      loadSaved: (n) =>
        Promise.resolve(device.has(n) ? { raw: device.get(n), fetchedAt: savedAt } : null),
      save: () => Promise.resolve(),
      now: () => Date.parse('2026-10-24T09:00:00.000Z'),
    });
    const store = createFeedStore({ source: src });
    store.subscribe('kotimaa', () => undefined);
    for (let i = 0; i < 5; i++) await settle();

    const s = store.getState('kotimaa');
    expect(s).toMatchObject({ status: 'ready', offline: true, refreshing: false });
    expect(s.updatedAt).toEqual(savedAt);
    expect(pagesOf(s.items)).toEqual(pagesOf(KOTIMAA));
    // The article saved with it shows; one never loaded shows only its headline.
    expect(itemIngress(s, 105)).toEqual({ kind: 'text', text: ARTICLE_TEXT });
    expect(itemIngress(s, KOTIMAA[unread]!.page)).toEqual({ kind: 'none' });
  });
});

/** Page 160 as on Sunday 25.10.2026: rows 9-15 (date row and stories) empty. */
function sunday160(): Page {
  const page = structuredClone(load(160));
  for (const sp of page.subpages) {
    for (const line of sp.lines) {
      if (line.number < 9 || line.number > 15) continue;
      line.runs = [
        {
          text: ' '.repeat(40),
          hasText: false,
          column: 0,
          length: 40,
          fg: 'white',
          bg: 'black',
          graphics: false,
          doubleHeight: false,
        },
      ];
      line.text = line.runs[0]!.text;
    }
  }
  return page;
}

describe('Talous service items (D40)', () => {
  async function talous(src: FakeSource, store: FeedStore, page: Page) {
    store.subscribe('talous', () => undefined);
    src.answer(160, page);
    await settle();
  }

  it('asks for the stories only, never for the service pages', async () => {
    const { src, store } = setup();
    await talous(src, store, load(160));
    store.setVisible('talous', 0, 9);
    for (let i = 0; i < 4; i++) {
      for (const n of src.inFlight) src.answer(n, ARTICLE);
      await settle();
    }
    expect(src.started.filter((n) => n !== 160)).toEqual([161, 162, 163, 164, 165, 166]);
    const s = store.getState('talous');
    for (const n of [172, 174, 175, 188]) expect(itemIngress(s, n)).toEqual({ kind: 'none' });
  });

  it('Sunday: shows the four service links at once, with no article request', async () => {
    const { src, store } = setup();
    await talous(src, store, sunday160());
    const s = store.getState('talous');
    expect(s.status).toBe('ready');
    expect(pagesOf(s.items)).toEqual([172, 174, 175, 188]);
    expect(src.started).toEqual([160]);
    expect(itemIngress(s, 172)).toEqual({ kind: 'none' });
  });

  it('Sunday: the article footer walks through them (172 → 174 → 175 → 188)', async () => {
    const { src, store } = setup();
    await talous(src, store, sunday160());
    const items = store.getState('talous').items;
    expect(store.neighbours('talous', 174)).toEqual({ previous: items[0], next: items[2] });
    expect(store.neighbours('talous', 172)?.next?.page).toBe(174);
    expect(store.neighbours('talous', 188)).toEqual({ previous: items[2], next: null });
  });
});

describe('neighbours', () => {
  it('gives the stories before and after, with none past either end', async () => {
    const { src, store } = setup();
    await kotimaa(src, store);
    const [a, b, c] = KOTIMAA;
    const last = KOTIMAA[KOTIMAA.length - 1]!;
    const beforeLast = KOTIMAA[KOTIMAA.length - 2]!;
    expect(store.neighbours('kotimaa', b!.page)).toEqual({ previous: a, next: c });
    expect(store.neighbours('kotimaa', a!.page)).toEqual({ previous: null, next: b });
    expect(store.neighbours('kotimaa', last.page)).toEqual({ previous: beforeLast, next: null });
  });

  it('follows Uutiset from Kotimaa into Ulkomaat', async () => {
    const { src, store } = setup();
    store.subscribe('uutiset', () => undefined);
    src.answer(102, load(102));
    src.answer(130, load(130));
    await settle();
    const lastKotimaa = KOTIMAA[KOTIMAA.length - 1]!;
    expect(store.neighbours('uutiset', lastKotimaa.page)?.next).toEqual(ULKOMAAT[0]);
  });

  it('is null for an unknown list, a list not built yet, or a page not in it', async () => {
    const { src, store } = setup();
    expect(store.neighbours('kotimaa', 103)).toBeNull();
    expect(store.neighbours('foo', 103)).toBeNull();
    expect(store.neighbours('etusivu', 103)).toBeNull();
    await kotimaa(src, store);
    expect(store.neighbours('kotimaa', 999)).toBeNull();
  });

  it("uses Etusivu's registered order", () => {
    const { store } = setup();
    const list: FeedItem[] = [
      { page: 105, headline: 'Lead', section: 'news' },
      { page: 131, headline: 'Two', section: 'world' },
      { page: 202, headline: 'Three', section: 'sport' },
    ];
    store.registerList('etusivu', list);
    expect(store.neighbours('etusivu', 131)).toEqual({ previous: list[0], next: list[2] });
    store.registerList('etusivu', list.slice(1));
    expect(store.neighbours('etusivu', 131)).toEqual({ previous: null, next: list[2] });
  });
});
