import { describe, expect, it } from 'vitest';
import {
  BROWSER_MAX_AGE_CAP_S,
  browserMaxAge,
  INDEX_PAGES,
  kindOf,
  LIMIT_S,
  limitFor,
  LIVE_PAGES,
  NEWS_RANGES,
  YleBudget,
  type PageKind,
} from './ttl.ts';
// Read-only: the app's own lists of index pages and article ranges.
import frontPageSource from '../../src/front/frontPage.ts?raw';
import feedListSource from '../../src/feed/feedList.ts?raw';
import generateSource from '../../src/sections/generate.ts?raw';
import fixture221 from '../../fixtures/pages/221.json?raw';
import fixture242 from '../../fixtures/pages/242.json?raw';
import fixture263 from '../../fixtures/pages/263.json?raw';

/** Every text row of a saved Yle page, joined. */
function textOf(raw: string): string {
  const page = JSON.parse(raw).teletext.page;
  const rows: string[] = [];
  for (const sp of [page.subpage].flat()) {
    for (const c of [sp.content].flat()) {
      if (c.type !== 'text') continue;
      for (const l of c.line) if (l.Text) rows.push(l.Text);
    }
  }
  return rows.join('\n');
}

describe('limits', () => {
  it('are the D39 B values', () => {
    expect(LIMIT_S).toEqual({ live: 60, index: 120, news: 300, other: 1800, 'not-found': 30 });
  });
});

describe('kindOf on every saved page (fixtures/pages)', () => {
  // Each saved page, with what fixtures/README.md says it is.
  const cases: [number, PageKind, string][] = [
    [100, 'index', 'front page'],
    [101, 'index', 'Uutiset index'],
    [102, 'index', 'Kotimaa index'],
    [103, 'news', 'domestic article'],
    [104, 'news', 'domestic article'],
    [105, 'news', 'domestic article'],
    [109, 'news', 'domestic article'],
    [110, 'news', 'domestic article'],
    [112, 'news', 'Vaaratiedotteet (hazard notices)'],
    [130, 'index', 'Ulkomaat index'],
    [131, 'news', 'foreign article'],
    [132, 'news', 'foreign article'],
    [136, 'news', 'foreign article'],
    [160, 'index', 'Talous index'],
    [161, 'news', 'economy article'],
    [162, 'news', 'economy article'],
    [163, 'news', 'economy article'],
    [174, 'other', 'world stock quotes'],
    [175, 'other', 'stock pages menu'],
    [190, 'other', 'News in English (service ended)'],
    [199, 'index', 'main index'],
    [200, 'index', 'Urheilu index'],
    [201, 'index', 'Urheilu headlines'],
    [202, 'news', 'sports bulletins'],
    [203, 'news', 'cross-country results, a sports feed item'],
    [205, 'news', 'sports article'],
    [207, 'news', 'F1 lap times, a sports feed item'],
    [218, 'news', 'alpine skiing results, a sports feed item'],
    [221, 'live', 'Liiga scores'],
    [230, 'other', 'U20 table and fixtures'],
    [233, 'other', 'Auroraliiga table'],
    [235, 'other', 'NHL results of the night'],
    [237, 'other', 'NHL tables'],
    [242, 'other', 'Veikkausliiga table'],
    [246, 'other', 'football results'],
    [250, 'other', 'football tables'],
    [254, 'other', 'volleyball table'],
    [260, 'other', 'handball table'],
    [263, 'other', 'floorball table'],
    [270, 'other', 'basketball results'],
    [298, 'other', 'F1 standings'],
    [299, 'other', 'WRC standings'],
    [300, 'index', 'TV and radio index'],
    [301, 'other', 'TV guide'],
    [302, 'other', 'TV guide'],
    [310, 'other', 'TV guide'],
    [330, 'other', 'subtitles menu'],
    [400, 'index', 'weather and traffic index'],
    [401, 'other', 'weather'],
    [402, 'other', 'weather'],
    [403, 'other', 'weather text'],
    [404, 'other', 'weather text'],
    [405, 'other', 'five-day forecast'],
    [406, 'other', 'weather table'],
    [407, 'other', 'weather table'],
    [408, 'other', 'weather table'],
    [410, 'other', 'traffic menu'],
    [417, 'other', 'road conditions'],
    [418, 'other', 'pollen map'],
    [419, 'other', 'weather legend'],
    [420, 'other', 'slopes and trails'],
    [460, 'other', 'horse racing menu'],
    [470, 'other', 'Veikkaus menu'],
    [500, 'index', 'regional news index'],
    [575, 'other', 'teletext info'],
    [700, 'index', 'Svenska index'],
    [714, 'news', 'Swedish news slot'],
    [725, 'news', 'Swedish regional article'],
    [799, 'index', 'Svenska section'],
    [890, 'other', 'calendar menu'],
  ];
  it.each(cases)('%i is %s (%s)', (page, kind) => {
    expect(kindOf(page)).toBe(kind);
    expect(limitFor(page)).toEqual({ kind, limitS: LIMIT_S[kind] });
  });

  it('a missing page (999, and 112 when Yle has no notices) is not-found, 30 s', () => {
    expect(limitFor(999, 404)).toEqual({ kind: 'not-found', limitS: 30 });
    expect(limitFor(112, 404)).toEqual({ kind: 'not-found', limitS: 30 });
    // Even a live or index page: Yle's 404 decides.
    expect(kindOf(221, 404)).toBe('not-found');
    expect(kindOf(100, 404)).toBe('not-found');
  });
});

describe('kindOf range edges', () => {
  it.each([
    [102, 'index'],
    [103, 'news'],
    [129, 'news'],
    [131, 'news'],
    [159, 'news'],
    [161, 'news'],
    [171, 'news'],
    [172, 'other'],
    [219, 'news'],
    [220, 'index'],
    [222, 'live'],
    [223, 'other'],
    [241, 'live'],
    [261, 'live'],
    [501, 'news'],
    [521, 'news'],
    [522, 'other'],
    [600, 'news'],
    [661, 'news'],
    [699, 'news'],
    [701, 'news'],
    [749, 'news'],
    [750, 'other'],
    [800, 'index'],
    [801, 'other'],
    [899, 'other'],
  ] as const)('%i is %s', (page, kind) => {
    expect(kindOf(page)).toBe(kind);
  });
});

describe('the live pages', () => {
  it('are a short list (one page read all the time at 60 s is 60 Yle requests an hour)', () => {
    expect([...LIVE_PAGES].sort()).toEqual([221, 222, 241, 261]);
  });

  it('221 is SM-liiga scores and points to its goals on 222 (fixture 221)', () => {
    const text = textOf(fixture221);
    expect(text).toContain('SM-LIIGA');
    expect(text).toMatch(/\d-\d \(\d-\d,\d-\d,\d-\d\)/); // score with periods
    expect(text).toMatch(/Maalit 222/);
  });

  it('241 and 261 are the match-tracking pages the league tables name (fixtures 242, 263)', () => {
    expect(textOf(fixture242)).toContain('Otteluseuranta s. 241');
    expect(textOf(fixture263)).toContain('Otteluseuranta s. 261');
  });

  it('are not also index or news pages', () => {
    for (const p of LIVE_PAGES) expect(INDEX_PAGES.has(p)).toBe(false);
  });
});

describe('the same section knowledge as the app (read-only drift check)', () => {
  /** The page numbers in `export const name … = …` up to the blank line after it. */
  function numbersAfter(source: string, name: string): number[] {
    const start = source.indexOf(`export const ${name}`);
    expect(start, `${name} not found in the app source`).toBeGreaterThan(-1);
    const value = source.indexOf('=', start);
    const body = source.slice(value, source.indexOf('\n\n', value));
    return [...body.matchAll(/\b[1-8]\d\d\b/g)].map((m) => Number(m[0]));
  }

  it("every index page of the app's (NAV_PAGES) is an index page here, except 190", () => {
    const nav = numbersAfter(frontPageSource, 'NAV_PAGES');
    expect(nav.length).toBeGreaterThan(10);
    for (const p of nav.filter((n) => n !== 190)) expect(kindOf(p), String(p)).toBe('index');
    expect(kindOf(190)).toBe('other');
  });

  it("every page the app's feeds are built from (FEED_PAGES) is an index page here", () => {
    const feeds = numbersAfter(feedListSource, 'FEED_PAGES');
    expect(feeds).toEqual(expect.arrayContaining([102, 130, 160, 201]));
    for (const p of feeds) expect(kindOf(p), String(p)).toBe('index');
  });

  it("every page in the app's article ranges (HEADLINE_RANGES) is news here, or live", () => {
    const bounds = numbersAfter(generateSource, 'HEADLINE_RANGES');
    expect(bounds).toEqual(expect.arrayContaining([103, 129, 221, 222]));
    expect(bounds.length % 2).toBe(0);
    for (let i = 0; i < bounds.length; i += 2) {
      for (let p = bounds[i]; p <= bounds[i + 1]; p++) {
        expect(['news', 'live'], String(p)).toContain(kindOf(p));
      }
    }
  });

  it('news ranges do not overlap the index pages', () => {
    for (const p of INDEX_PAGES) {
      expect(
        NEWS_RANGES.some((r) => p >= r.from && p <= r.to),
        String(p),
      ).toBe(false);
    }
  });
});

describe('browserMaxAge', () => {
  it.each([
    [60, 15],
    [30, 7],
    [120, 30],
    [300, 75],
    [1800, 120],
    [3600, 120],
    [600, 120],
  ])('limit %i s gives the browser %i s', (limit, expected) => {
    expect(browserMaxAge(limit)).toBe(expected);
  });

  it('is never more than a quarter of the limit nor over the cap', () => {
    for (const kind of Object.keys(LIMIT_S) as PageKind[]) {
      for (const factor of [1, 2]) {
        const limit = LIMIT_S[kind] * factor;
        expect(browserMaxAge(limit)).toBeLessThanOrEqual(limit / 4);
        expect(browserMaxAge(limit)).toBeLessThanOrEqual(BROWSER_MAX_AGE_CAP_S);
      }
    }
  });
});

describe('YleBudget', () => {
  const hour = Date.parse('2026-10-25T14:00:00Z');

  it('is 1 up to 210 requests in the hour and 2 after (70 % of 300)', () => {
    const b = new YleBudget();
    for (let i = 0; i < 210; i++) b.record(hour + i * 1000);
    expect(b.used(hour + 300_000)).toBe(210);
    expect(b.factor(hour + 300_000)).toBe(1);
    b.record(hour + 301_000);
    expect(b.factor(hour + 301_000)).toBe(2);
    expect(b.factor(hour + 3_599_999)).toBe(2);
  });

  it('starts again at the next hour', () => {
    const b = new YleBudget();
    for (let i = 0; i < 250; i++) b.record(hour + 3_000_000);
    expect(b.factor(hour + 3_599_999)).toBe(2);
    expect(b.factor(hour + 3_600_000)).toBe(1);
    expect(b.used(hour + 3_600_000)).toBe(0);
  });
});
