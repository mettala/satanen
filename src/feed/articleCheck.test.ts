/**
 * D39 C (FR.4) end to end, without React: an article opened from a list is
 * checked against the list's headline. The real page source and feed store,
 * a fake fetch (fixture pages; edited copies stand for "page 105 was another
 * story when the proxy cached it"), a fake clock.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetPageOptions, PageResult } from '../api/client';
import { createPageSource, type PageSource } from '../data/pageSource';
import { frontPage, ingress } from '../front/frontPage';
import { normalize } from '../parser/normalize';
import { createFeedStore, itemIngress, type FeedStore } from './feedStore';
import { etusivuItems } from './footer';
import { pageHeadline } from './pageHeadline';

const here = fileURLToPath(new URL('.', import.meta.url));
const text = (n: number) => readFileSync(resolve(here, `../../fixtures/pages/${n}.json`), 'utf8');

/** Page `n` as the proxy sends it, with same-length text swaps applied everywhere. */
function version(n: number, edits: [string, string][] = [], stale = false): PageResult {
  let body = text(n);
  for (const [from, to] of edits) {
    if (!body.includes(from)) throw new Error(`fixture ${n} has no "${from}"`);
    body = body.split(from).join(to);
  }
  const raw: unknown = JSON.parse(body);
  const r = normalize(raw);
  if (!r.ok) throw new Error(`fixture ${n} does not normalise`);
  return { ok: true, page: r.page, raw, stale, fetchedAt: null, limitMs: null };
}

const pageOf = (r: PageResult) => {
  if (!r.ok) throw new Error('not a page');
  return r.page;
};

/** Article 105 when it was another story (same length, so the layout stays). */
const OTHER_STORY_105: [string, string] = [
  'Yksi kuoli Jyväskylän palossa ',
  'Hirvi juoksi tielle Porissa   ',
];
/** Article 109 (on Etusivu) when it was another story. */
const OTHER_STORY_109: [string, string] = [
  'Verkkopalveluja ajetaan alas',
  'Hirvi juoksi tielle Porissa ',
];
/** Index 102 listing that other story for 105. */
const LIST_SAYS_OTHER_STORY: [string, string] = [
  'Yksi kuoli Jyväskylän palossa',
  'Hirvi juoksi tielle Porissa  ',
];

let served: Map<number, PageResult>;
/** What the proxy answers to `?fresh=1`; falls back to `served`. */
let servedFresh: Map<number, PageResult>;
let calls: { n: number; fresh: boolean }[];
/** Requests for these pages wait until the promise resolves. */
let held: Map<number, Promise<void>>;
let source: PageSource;
let feeds: FeedStore;

const flush = () => vi.advanceTimersByTimeAsync(0);
const callsFor = (n: number) => calls.filter((c) => c.n === n && !c.fresh).length;
const freshCalls = () => calls.filter((c) => c.fresh).map((c) => c.n);

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-25T09:00:00.000Z') });
  served = new Map([
    [100, version(100)],
    [102, version(102)],
    [105, version(105)],
    [109, version(109)],
  ]);
  servedFresh = new Map();
  held = new Map();
  calls = [];
  source = createPageSource({
    fetchPage: async (n: number, options?: GetPageOptions) => {
      const fresh = options?.fresh === true;
      calls.push({ n, fresh });
      await held.get(n);
      return (
        (fresh ? servedFresh.get(n) : undefined) ??
        served.get(n) ?? { ok: false, reason: 'not-found' }
      );
    },
    loadSaved: async () => null,
    save: async () => undefined,
    now: () => Date.now(),
  });
  feeds = createFeedStore({ source, now: () => Date.now() });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Kotimaa built from 102, the reader scrolled down to 105, then 105 opened from it. */
async function openFromKotimaa(): Promise<() => void> {
  const off = feeds.subscribe('kotimaa', () => undefined);
  await flush();
  expect(feeds.itemOf('kotimaa', 105)?.headline).toBe('Yksi kuoli Jyväskylän palossa');
  feeds.setScrollY('kotimaa', 640);
  const article = source.subscribe(105, () => undefined);
  await flush();
  return () => {
    article();
    off();
  };
}

const shownHeadline = () => {
  const page = source.getSnapshot(105).page;
  return page ? pageHeadline(page) : undefined;
};

describe('an article opened from a list', () => {
  it('same story as the list: no extra request', async () => {
    await openFromKotimaa();
    calls = [];
    expect(await feeds.checkArticle('kotimaa', 105)).toBe('same');
    expect(calls).toEqual([]);
  });

  it('another story than the list: asks the proxy once for a fresh copy, which matches', async () => {
    served.set(105, version(105, [OTHER_STORY_105]));
    servedFresh.set(105, version(105));
    await openFromKotimaa();
    expect(shownHeadline()).toBe('Hirvi juoksi tielle Porissa');
    // The first paragraph the list took came from the other story's copy.
    expect(itemIngress(feeds.getState('kotimaa'), 105)).toEqual({
      kind: 'text',
      text: ingress(pageOf(served.get(105)!)),
    });
    calls = [];

    const check = feeds.checkArticle('kotimaa', 105);
    await flush();
    expect(await check).toBe('fresh-same');
    expect(calls).toEqual([{ n: 105, fresh: true }]);
    expect(shownHeadline()).toBe('Yksi kuoli Jyväskylän palossa');
    // ... and is now taken from the right one.
    expect(itemIngress(feeds.getState('kotimaa'), 105)).toEqual({
      kind: 'text',
      text: ingress(pageOf(version(105))),
    });
    // The list was not touched.
    expect(callsFor(102)).toBe(0);
  });

  it('still another story after the fresh copy: the list is checked again, and offered, not swapped', async () => {
    served.set(105, version(105, [OTHER_STORY_105]));
    await openFromKotimaa();
    const before = feeds.getState('kotimaa').items.map((i) => i.headline);
    // Yle's index has moved on too; the app's list is the old one.
    served.set(102, version(102, [LIST_SAYS_OTHER_STORY]));
    calls = [];

    const check = feeds.checkArticle('kotimaa', 105);
    await flush();
    expect(await check).toBe('list-checked');
    // One fresh request for the article, never more; the index page through the usual path.
    expect(freshCalls()).toEqual([105]);
    expect(callsFor(102)).toBe(1);
    expect(calls.filter((c) => c.n === 102 && c.fresh)).toEqual([]);
    // The reader is down the list: it waits behind "Päivitä lista".
    const s = feeds.getState('kotimaa');
    expect(s.hasUpdate).toBe(true);
    expect(s.items.map((i) => i.headline)).toEqual(before);
    feeds.applyUpdate('kotimaa');
    expect(feeds.itemOf('kotimaa', 105)?.headline).toBe('Hirvi juoksi tielle Porissa');
  });

  it('a list at the top is replaced at once by the checked one', async () => {
    served.set(105, version(105, [OTHER_STORY_105]));
    await openFromKotimaa();
    feeds.setScrollY('kotimaa', 0);
    served.set(102, version(102, [LIST_SAYS_OTHER_STORY]));
    const check = feeds.checkArticle('kotimaa', 105);
    await flush();
    expect(await check).toBe('list-checked');
    expect(feeds.getState('kotimaa').hasUpdate).toBe(false);
    expect(feeds.itemOf('kotimaa', 105)?.headline).toBe('Hirvi juoksi tielle Porissa');
  });

  it('still differs but the index page has not changed: nothing visible happens', async () => {
    served.set(105, version(105, [OTHER_STORY_105]));
    await openFromKotimaa();
    calls = [];
    const check = feeds.checkArticle('kotimaa', 105);
    await flush();
    expect(await check).toBe('list-checked');
    expect(callsFor(102)).toBe(1);
    expect(feeds.getState('kotimaa').hasUpdate).toBe(false);
    expect(feeds.itemOf('kotimaa', 105)?.headline).toBe('Yksi kuoli Jyväskylän palossa');
  });

  it('a missing article (404): the not-found state, and no extra request', async () => {
    served.delete(105);
    await openFromKotimaa();
    expect(source.getSnapshot(105)).toMatchObject({ status: 'error', reason: 'not-found' });
    calls = [];
    expect(await feeds.checkArticle('kotimaa', 105)).toBe('skipped');
    expect(calls).toEqual([]);
  });

  it('the fresh copy is a 404: the not-found state, the list is left for its next refresh', async () => {
    served.set(105, version(105, [OTHER_STORY_105]));
    servedFresh.set(105, { ok: false, reason: 'not-found' });
    await openFromKotimaa();
    calls = [];
    const check = feeds.checkArticle('kotimaa', 105);
    await flush();
    expect(await check).toBe('skipped');
    expect(source.getSnapshot(105)).toMatchObject({ status: 'error', reason: 'not-found' });
    expect(calls).toEqual([{ n: 105, fresh: true }]);
  });

  it("the proxy's old copy (Yle down): asking again can't help, so it doesn't", async () => {
    served.set(105, version(105, [OTHER_STORY_105], true));
    await openFromKotimaa();
    calls = [];
    expect(await feeds.checkArticle('kotimaa', 105)).toBe('skipped');
    expect(calls).toEqual([]);
  });

  it('offline: nothing is asked again', async () => {
    served.set(105, version(105, [OTHER_STORY_105]));
    await openFromKotimaa();
    servedFresh.set(105, { ok: false, reason: 'offline' });
    calls = [];
    const check = feeds.checkArticle('kotimaa', 105);
    await flush();
    expect(await check).toBe('skipped');
    expect(callsFor(102)).toBe(0);
  });

  it('waits for the network answer when the article is still loading', async () => {
    let release = () => undefined as void;
    held.set(105, new Promise<void>((r) => (release = r)));
    served.set(105, version(105, [OTHER_STORY_105]));
    servedFresh.set(105, version(105));
    const off = feeds.subscribe('kotimaa', () => undefined);
    await flush();
    expect(source.getSnapshot(105).status).toBe('loading');
    let result: string | null = null;
    void feeds.checkArticle('kotimaa', 105).then((r) => (result = r));
    await flush();
    expect(result).toBeNull();
    held.delete(105);
    release();
    await flush();
    expect(result).toBe('fresh-same');
    expect(freshCalls()).toEqual([105]);
    off();
  });

  it('not opened from a known list: nothing to compare', async () => {
    expect(await feeds.checkArticle('kotimaa', 105)).toBe('no-list');
    await openFromKotimaa();
    expect(await feeds.checkArticle('nope', 105)).toBe('no-list');
    expect(await feeds.checkArticle('kotimaa', 899)).toBe('no-list');
  });
});

describe('an article opened from Etusivu', () => {
  async function openFromEtusivu() {
    // As FrontPageView does: page 100 subscribed, its items registered.
    source.subscribe(100, () => undefined);
    feeds.registerList('etusivu', etusivuItems(frontPage(pageOf(served.get(100)!))));
    source.subscribe(109, () => undefined);
    await flush();
    expect(feeds.itemOf('etusivu', 109)?.headline).toBe('Verkkopalveluja ajetaan alas');
  }

  it('same story: no extra request', async () => {
    await openFromEtusivu();
    calls = [];
    expect(await feeds.checkArticle('etusivu', 109)).toBe('same');
    expect(calls).toEqual([]);
  });

  it('still another story after the fresh copy: page 100 is fetched again quietly', async () => {
    served.set(109, version(109, [OTHER_STORY_109]));
    await openFromEtusivu();
    calls = [];
    const check = feeds.checkArticle('etusivu', 109);
    await flush();
    expect(await check).toBe('list-checked');
    expect(calls).toEqual([
      { n: 109, fresh: true },
      { n: 100, fresh: false },
    ]);
    // Quiet: the front page shows no spinner for it.
    expect(source.getSnapshot(100).refreshing).toBe(false);
  });
});
