/**
 * D39 A end to end, without React: the real page source and feed store, a fake
 * fetch (fixture pages, with edited copies standing for "Yle changed it"), a
 * fake clock and fake foreground events.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageResult } from '../api/client';
import { createForeground, LIST_LIMIT_MS, PAGE_LIMIT_MS, type Foreground } from '../data/freshness';
import { createPageSource, type PageSource } from '../data/pageSource';
import { createUpdateNotice, UPDATED_NOTICE_MS } from '../data/updateNotice';
import { normalize } from '../parser/normalize';
import { createFeedStore, type FeedStore } from './feedStore';
import { connectRefreshOnReturn } from './refreshOnReturn';

const here = fileURLToPath(new URL('.', import.meta.url));
const text = (n: number) => readFileSync(resolve(here, `../../fixtures/pages/${n}.json`), 'utf8');

/**
 * Page `n` as the proxy sends it, with `edits` (same-length text swaps)
 * applied everywhere (Yle sends each row in more than one form).
 */
function version(n: number, edits: [string, string][] = []): PageResult {
  let body = text(n);
  for (const [from, to] of edits) {
    if (!body.includes(from)) throw new Error(`fixture ${n} has no "${from}"`);
    body = body.split(from).join(to);
  }
  const raw: unknown = JSON.parse(body);
  const r = normalize(raw);
  if (!r.ok) throw new Error(`fixture ${n} does not normalise`);
  return { ok: true, page: r.page, raw, stale: false, fetchedAt: null, limitMs: null };
}

// Same length, so every column stays where it was.
const NEW_HEADLINE: [string, string] = [
  'Auto törmäsi tolppaan Limingassa',
  'Auto suistui ojaan Limingassa   ',
];
const NEW_ARTICLE_TITLE: [string, string] = [
  'Yksi kuoli Jyväskylän palossa ',
  'Kaksi kuoli Jyväskylän palossa',
];

const NIGHT = 9 * 60 * 60_000;
const MINUTE = 60_000;

let served: Map<number, PageResult>;
let calls: number[];
let offline: boolean;
let source: PageSource;
let feeds: FeedStore;
let fg: Foreground;
let disconnect: () => void;

/** Lets the fake fetches and the stores' promise callbacks run. */
const flush = () => vi.advanceTimersByTimeAsync(0);
const callsFor = (n: number) => calls.filter((c) => c === n).length;
const headlines = (id: 'kotimaa') => feeds.getState(id).items.map((i) => i.headline);

/** The app goes to the background for `ms`, then comes back. */
async function away(ms: number) {
  fg.setVisible(false);
  await vi.advanceTimersByTimeAsync(ms);
  fg.setVisible(true);
  await flush();
}

/** `ms` pass with the app open, then the timer ticks. */
async function tickAfter(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  fg.tick();
  await flush();
}

interface Screen {
  /** Another screen comes in front (an article opened on top, another tab). */
  blur(): void;
  /** Back in front. */
  focus(): void;
  /** Taken down. */
  close(): void;
}

/** A screen showing page `n`, as PageView wires it: subscribed, and focused while in front. */
function openPage(n: number, onChange: () => void = () => undefined): Screen {
  const off = source.subscribe(n, onChange);
  let unfocus: (() => void) | null = source.focus(n);
  return {
    blur: () => {
      unfocus?.();
      unfocus = null;
    },
    focus: () => {
      unfocus ??= source.focus(n);
    },
    close: () => {
      unfocus?.();
      off();
    },
  };
}

/** Page `n` in a tab that isn't the one shown: mounted (subscribed) but never in front. */
function hiddenTab(n: number) {
  source.subscribe(n, () => undefined);
}

/** Kotimaa in front, built from page 102, as FeedView wires it. */
async function openKotimaa(): Promise<Screen> {
  const off = feeds.subscribe('kotimaa', () => undefined);
  let unfocus: (() => void) | null = feeds.focus('kotimaa');
  await flush();
  expect(feeds.getState('kotimaa').status).toBe('ready');
  return {
    blur: () => {
      unfocus?.();
      unfocus = null;
    },
    focus: () => {
      unfocus ??= feeds.focus('kotimaa');
    },
    close: () => {
      unfocus?.();
      off();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-24T19:00:00.000Z') });
  served = new Map([
    [100, version(100)],
    [102, version(102)],
    [105, version(105)],
    [109, version(109)],
    [400, version(400)],
  ]);
  calls = [];
  offline = false;
  source = createPageSource({
    fetchPage: async (n) => {
      calls.push(n);
      if (offline) return { ok: false, reason: 'offline' };
      return served.get(n) ?? { ok: false, reason: 'not-found' };
    },
    loadSaved: async () => null,
    save: async () => undefined,
    now: () => Date.now(),
  });
  feeds = createFeedStore({ source, now: () => Date.now() });
  fg = createForeground({ now: () => Date.now() });
  disconnect = connectRefreshOnReturn(fg, source, feeds);
});

afterEach(() => {
  disconnect();
  vi.useRealTimers();
});

describe('coming back to the app', () => {
  it('after a night: the screen in front is fetched again; a hidden tab when it is opened', async () => {
    hiddenTab(100); // Etusivu, mounted in its tab
    await openKotimaa();
    await flush();
    feeds.setScrollY('kotimaa', 900); // left somewhere down the list
    served.set(102, version(102, [NEW_HEADLINE]));
    calls = [];
    await away(NIGHT);

    expect([callsFor(102), callsFor(100)]).toEqual([1, 0]);
    // Away for hours: the new list simply replaces the old one, from the top.
    expect(feeds.getState('kotimaa').hasUpdate).toBe(false);
    expect(headlines('kotimaa')).toContain('Auto suistui ojaan Limingassa');
    expect(feeds.scrollY('kotimaa')).toBe(0);

    // Switching to the Etusivu tab brings it to the front: now it is checked.
    source.focus(100);
    await flush();
    expect(callsFor(100)).toBe(1);
  });

  it('after 1 minute: nothing is fetched', async () => {
    await openKotimaa();
    openPage(105);
    await flush();
    calls = [];
    await away(MINUTE);
    expect(calls).toEqual([]);
  });

  it('uses each page’s own limit: a list after 2 minutes, an article after 5', async () => {
    const list = await openKotimaa();
    calls = [];
    await away(LIST_LIMIT_MS + 1000);
    expect(calls).toEqual([102]);

    list.blur();
    openPage(105); // an article opened from the list
    await flush();
    calls = [];
    await away(LIST_LIMIT_MS + 1000);
    expect(calls).toEqual([]);
    await away(PAGE_LIMIT_MS - LIST_LIMIT_MS);
    expect(calls).toEqual([105]);
  });

  it('only the screen in front: not the list behind an article, not hidden tabs', async () => {
    hiddenTab(400); // Sää
    const list = await openKotimaa();
    list.blur();
    openPage(105);
    await flush();
    calls = [];
    await away(NIGHT);
    expect(calls).toEqual([105]);

    // Back to the list: it is checked as it comes to the front.
    list.focus();
    await flush();
    expect(calls).toEqual([105, 102]);
  });

  it('does not fetch pages no screen shows any more', async () => {
    openPage(105).close();
    await flush();
    calls = [];
    await away(NIGHT);
    expect(calls).toEqual([]);
  });

  it('two screens showing the same page share one request', async () => {
    openPage(105);
    openPage(105);
    await flush();
    calls = [];
    await away(NIGHT);
    expect(callsFor(105)).toBe(1);
  });

  it('the list and its header watching one feed share one request', async () => {
    await openKotimaa();
    feeds.subscribe('kotimaa', () => undefined);
    feeds.focus('kotimaa');
    await flush();
    calls = [];
    await away(NIGHT);
    expect(callsFor(102)).toBe(1);
  });

  it('the quiet fetch shows no spinner', async () => {
    const seen: boolean[] = [];
    openPage(105, () => {
      const s = source.getSnapshot(105);
      if (s.refreshing) seen.push(s.background);
    });
    await flush();
    seen.length = 0;
    fg.setVisible(false);
    await vi.advanceTimersByTimeAsync(NIGHT);
    fg.setVisible(true);
    expect(seen).toEqual([true]);
    await flush();
  });

  it('offline on return: keeps what is shown, marks the list offline, tries again later', async () => {
    await openKotimaa();
    const before = feeds.getState('kotimaa').items;
    offline = true;
    calls = [];
    await away(NIGHT);
    expect(calls).toEqual([102]);
    expect(feeds.getState('kotimaa')).toMatchObject({ status: 'ready', offline: true });
    expect(feeds.getState('kotimaa').items).toBe(before);

    // The next tick is the earliest retry; the network is back, nothing changed at Yle.
    offline = false;
    calls = [];
    await tickAfter(30_000);
    expect(calls).toEqual([102]);
    expect(feeds.getState('kotimaa')).toMatchObject({ offline: false, hasUpdate: false });
  });

  it('back overnight, first check offline, reader scrolls: a later change shows the button, no swap', async () => {
    await openKotimaa();
    const before = feeds.getState('kotimaa').items;
    feeds.setScrollY('kotimaa', 900);
    served.set(102, version(102, [NEW_HEADLINE]));
    offline = true; // the phone has just woken up
    await away(NIGHT);
    expect(feeds.getState('kotimaa')).toMatchObject({ offline: true, hasUpdate: false });

    feeds.setScrollY('kotimaa', 1400); // reading again
    offline = false;
    await tickAfter(30_000);

    const s = feeds.getState('kotimaa');
    expect(s.hasUpdate).toBe(true);
    expect(s.items).toBe(before);
    expect(feeds.scrollY('kotimaa')).toBe(1400);
  });

  it('back overnight, first check offline, a slow drag in small steps: button, no swap', async () => {
    await openKotimaa();
    const before = feeds.getState('kotimaa').items;
    feeds.setScrollY('kotimaa', 900);
    served.set(102, version(102, [NEW_HEADLINE]));
    offline = true;
    await away(NIGHT);

    // About 30 scroll events of 3 px each: under 8 px apart, but 90 px from the start.
    for (let i = 1; i <= 30; i++) feeds.setScrollY('kotimaa', 900 + i * 3);
    offline = false;
    await tickAfter(30_000);

    const s = feeds.getState('kotimaa');
    expect(s.hasUpdate).toBe(true);
    expect(s.items).toBe(before);
    expect(feeds.scrollY('kotimaa')).toBe(990);
  });

  it('back overnight, first check offline, reader has not scrolled: the next check replaces', async () => {
    await openKotimaa();
    feeds.setScrollY('kotimaa', 900);
    served.set(102, version(102, [NEW_HEADLINE]));
    offline = true;
    await away(NIGHT);
    feeds.setScrollY('kotimaa', 900); // the list putting itself back, not the reader
    offline = false;
    await tickAfter(30_000);
    expect(feeds.getState('kotimaa').hasUpdate).toBe(false);
    expect(headlines('kotimaa')).toContain('Auto suistui ojaan Limingassa');
  });
});

describe('while the app stays open (timer)', () => {
  it('the list in front is checked again every limit', async () => {
    await openKotimaa();
    calls = [];
    await tickAfter(LIST_LIMIT_MS - 1000);
    expect(calls).toEqual([]);
    await tickAfter(1000);
    expect(calls).toEqual([102]);
  });

  it('Etusivu in front (page 100) is checked again every limit', async () => {
    openPage(100);
    await flush();
    calls = [];
    await tickAfter(LIST_LIMIT_MS);
    expect(calls).toEqual([100]);
  });

  it('an article in front is not fetched on the timer', async () => {
    openPage(105);
    await flush();
    calls = [];
    await tickAfter(PAGE_LIMIT_MS + MINUTE);
    expect(calls).toEqual([]);
  });

  it('nothing behind the front screen or in hidden tabs is fetched on the timer', async () => {
    hiddenTab(400); // Sää
    const kotimaaTab = await openKotimaa();
    kotimaaTab.blur(); // Uutiset tab left for Etusivu
    const older = openPage(105);
    older.blur(); // an article further back in the stack
    openPage(100); // Etusivu in front
    await flush();
    calls = [];
    await tickAfter(PAGE_LIMIT_MS + MINUTE);
    expect(calls).toEqual([100]);
  });

  it('ignores the timer while the app is in the background', async () => {
    openPage(100);
    await flush();
    fg.setVisible(false);
    calls = [];
    await vi.advanceTimersByTimeAsync(NIGHT);
    fg.tick();
    await flush();
    expect(calls).toEqual([]);
  });
});

describe('a screen coming back to the front', () => {
  it('an article returned to after its limit is checked', async () => {
    const article = openPage(105);
    await flush();
    article.blur();
    openPage(109); // the next story on top
    await flush();
    await vi.advanceTimersByTimeAsync(PAGE_LIMIT_MS);
    calls = [];
    article.focus(); // Takaisin
    await flush();
    expect(calls).toEqual([105]);
  });

  it('within its limit it is not', async () => {
    const article = openPage(105);
    await flush();
    article.blur();
    await vi.advanceTimersByTimeAsync(MINUTE);
    calls = [];
    article.focus();
    await flush();
    expect(calls).toEqual([]);
  });
});

describe('lists (D39 A)', () => {
  it('changed while away over 5 minutes: replaced, even mid-list', async () => {
    await openKotimaa();
    feeds.setScrollY('kotimaa', 900);
    served.set(102, version(102, [NEW_HEADLINE]));
    await away(6 * MINUTE);
    expect(feeds.getState('kotimaa').hasUpdate).toBe(false);
    expect(headlines('kotimaa')).toContain('Auto suistui ojaan Limingassa');
  });

  it('changed while the reader is mid-list: the old list stays and the button appears', async () => {
    await openKotimaa();
    const before = feeds.getState('kotimaa').items;
    feeds.setScrollY('kotimaa', 900);
    served.set(102, version(102, [NEW_HEADLINE]));
    await away(3 * MINUTE);

    const s = feeds.getState('kotimaa');
    expect(s.hasUpdate).toBe(true);
    expect(s.items).toBe(before);
    expect(feeds.scrollY('kotimaa')).toBe(900);

    // "Päivitä lista": the new list, from the top.
    feeds.applyUpdate('kotimaa');
    expect(feeds.getState('kotimaa').hasUpdate).toBe(false);
    expect(headlines('kotimaa')).toContain('Auto suistui ojaan Limingassa');
    expect(feeds.scrollY('kotimaa')).toBe(0);
  });

  it('changed while mid-list: scrolling to the top does what the button does', async () => {
    await openKotimaa();
    feeds.setScrollY('kotimaa', 900);
    served.set(102, version(102, [NEW_HEADLINE]));
    await away(3 * MINUTE);
    expect(feeds.getState('kotimaa').hasUpdate).toBe(true);
    feeds.setScrollY('kotimaa', 300);
    expect(feeds.getState('kotimaa').hasUpdate).toBe(true);
    feeds.setScrollY('kotimaa', 0);
    expect(feeds.getState('kotimaa').hasUpdate).toBe(false);
    expect(headlines('kotimaa')).toContain('Auto suistui ojaan Limingassa');
  });

  it('changed while at the top: replaced at once, no button', async () => {
    await openKotimaa();
    served.set(102, version(102, [NEW_HEADLINE]));
    await away(3 * MINUTE);
    expect(feeds.getState('kotimaa').hasUpdate).toBe(false);
    expect(headlines('kotimaa')).toContain('Auto suistui ojaan Limingassa');
  });

  it('unchanged while mid-list: no button, the list is untouched', async () => {
    await openKotimaa();
    const before = feeds.getState('kotimaa').items;
    feeds.setScrollY('kotimaa', 900);
    calls = [];
    await away(3 * MINUTE);
    expect(calls).toEqual([102]);
    const s = feeds.getState('kotimaa');
    expect(s.hasUpdate).toBe(false);
    expect(s.items).toBe(before);
    expect(feeds.scrollY('kotimaa')).toBe(900);
  });

  it('a list opened again after its limit is checked too, with the same rules', async () => {
    const list = await openKotimaa();
    feeds.setScrollY('kotimaa', 900);
    list.close(); // went to an article, and the list screen was taken down
    served.set(102, version(102, [NEW_HEADLINE]));
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    calls = [];
    feeds.subscribe('kotimaa', () => undefined); // back to the list
    await flush();
    expect(calls).toEqual([102]);
    expect(feeds.getState('kotimaa').hasUpdate).toBe(true);
  });

  it('a check never shows the pull-to-refresh spinner; pulling replaces a waiting list', async () => {
    await openKotimaa();
    feeds.setScrollY('kotimaa', 900);
    served.set(102, version(102, [NEW_HEADLINE]));
    const spinner: boolean[] = [];
    feeds.subscribe('kotimaa', () => spinner.push(feeds.getState('kotimaa').refreshing));
    await away(3 * MINUTE);
    expect(spinner).not.toContain(true);
    expect(feeds.getState('kotimaa').hasUpdate).toBe(true);

    await feeds.refresh('kotimaa');
    expect(feeds.getState('kotimaa').hasUpdate).toBe(false);
    expect(headlines('kotimaa')).toContain('Auto suistui ojaan Limingassa');
  });

  it('a list opened again within its limit is not checked', async () => {
    const list = await openKotimaa();
    list.close();
    await vi.advanceTimersByTimeAsync(MINUTE);
    calls = [];
    feeds.subscribe('kotimaa', () => undefined);
    await flush();
    expect(calls).toEqual([]);
  });
});

describe('single pages (D39 A)', () => {
  /** Page 105 on screen with its "Sivu päivitetty" notice, as PageView wires them. */
  async function openArticle() {
    const notice = createUpdateNotice();
    openPage(105, () => notice.show(source.getSnapshot(105).page));
    await flush();
    expect(source.getSnapshot(105).status).toBe('ready');
    return notice;
  }

  it('changed: the text is replaced, the message shows and is gone after 5 s', async () => {
    const notice = await openArticle();
    served.set(105, version(105, [NEW_ARTICLE_TITLE]));
    await away(6 * MINUTE);

    const lines = source.getSnapshot(105).page!.subpages[0]!.lines.map((l) => l.text);
    expect(lines.some((l) => l.includes('Kaksi kuoli Jyväskylän palossa'))).toBe(true);
    expect(notice.getState().visible).toBe(true);

    await vi.advanceTimersByTimeAsync(UPDATED_NOTICE_MS - 1);
    expect(notice.getState().visible).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(notice.getState().visible).toBe(false);
  });

  it('unchanged: no message', async () => {
    const notice = await openArticle();
    calls = [];
    await away(6 * MINUTE);
    expect(calls).toEqual([105]);
    expect(notice.getState().visible).toBe(false);
  });
});

describe('the device copy at start-up', () => {
  it('is marked as being updated until the fresh copy arrives', async () => {
    const saved = version(105);
    const src = createPageSource({
      fetchPage: async () => {
        await new Promise((r) => setTimeout(r, 500));
        return version(105, [NEW_ARTICLE_TITLE]);
      },
      loadSaved: async () => ({
        raw: saved.ok ? saved.raw : null,
        fetchedAt: new Date('2026-10-23T19:00:00.000Z'),
      }),
      save: async () => undefined,
      now: () => Date.now(),
    });
    src.subscribe(105, () => undefined);
    await flush();
    expect(src.getSnapshot(105)).toMatchObject({
      status: 'ready',
      fromDevice: true,
      refreshing: true,
      background: false,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(src.getSnapshot(105)).toMatchObject({ fromDevice: false, refreshing: false });
  });
});
