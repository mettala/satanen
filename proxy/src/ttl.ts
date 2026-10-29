// How long the proxy keeps each kind of page (D39 B, replacing the single 45 s
// of D11). Pure apart from `YleBudget`, which only counts in memory.
//
// Yle allows (probably; not yet confirmed) 300 requests an hour for the whole
// key. A page read all the time costs 3600 / limit requests an hour per
// Cloudflare data centre, so freshness is spent where it matters: live results
// short, TV listings and weather long.
//
// Rules, in order (each has a test in ttl.test.ts):
//   1. Yle says the page doesn't exist (404)          → not-found  30 s
//   2. One of the live-results pages in LIVE_PAGES    → live       60 s
//   3. A headline list or section index (INDEX_PAGES) → index     120 s
//   4. In one of the news-article ranges (NEWS_RANGES) → news      300 s
//   5. Anything else (TV, weather, tables, stocks…)   → other    1800 s
//
// A picture of a page (`/v1/images/{page}/{sub}.png`) gets the same kind and
// limit as its page: it is the same page drawn differently, shown only when
// reader mode can't show the page, and it should be exactly as fresh as the
// text it stands in for.

export type PageKind = 'live' | 'index' | 'news' | 'other' | 'not-found';

/** Limit in seconds for each kind, before any doubling. */
export const LIMIT_S: Readonly<Record<PageKind, number>> = {
  live: 60,
  index: 120,
  news: 300,
  other: 1800,
  'not-found': 30,
};

/**
 * Pages that change minute by minute while games are on. Kept short on
 * purpose: one page read all the time at 60 s costs 60 of the 300 an hour.
 * Chosen from the 2xx fixtures and the Urheilu index (200, 201):
 *   221 SM-liiga scores by period with the latest goal (fixture 221).
 *   222 SM-liiga goals ("Maalit 222" in 221's bottom row).
 *   241 Veikkausliiga match tracking ("Otteluseuranta s. 241" on 242).
 *   261 F-liiga (floorball) match tracking ("Otteluseuranta s. 261" on 263).
 */
export const LIVE_PAGES: ReadonlySet<number> = new Set([221, 222, 241, 261]);

/**
 * Headline lists and section index pages: the app's index pages (`NAV_PAGES`
 * in src/front/frontPage.ts, the feeds' `FEED_PAGES` in src/feed/feedList.ts),
 * except 190, which is the English news page, not a list. Plus 220
 * (Palloilu), the ball-games page whose headline rows link to the live pages
 * 221 and 222. A test checks this list against the app's, so the two can't
 * drift apart unnoticed.
 */
export const INDEX_PAGES: ReadonlySet<number> = new Set([
  100, 101, 102, 130, 160, 199, 200, 201, 220, 300, 400, 500, 700, 799, 800,
]);

/**
 * Pages that hold the day's news articles. 1xx and 2xx follow the app's
 * `HEADLINE_RANGES` (src/sections/generate.ts); 202 (sports bulletins) is a
 * story on 201 too. Regional news 501–521 and Swedish news 701–749 follow the
 * 500 and 700 index pages. 6xx is where the sports feed links European
 * football stories (661).
 */
export const NEWS_RANGES: readonly { readonly from: number; readonly to: number }[] = [
  { from: 103, to: 129 },
  { from: 131, to: 159 },
  { from: 161, to: 171 },
  { from: 202, to: 219 },
  { from: 501, to: 521 },
  { from: 600, to: 699 },
  { from: 701, to: 749 },
];

/** The kind of a page, from its number and Yle's answer (200 or 404). */
export function kindOf(page: number, status: 200 | 404 = 200): PageKind {
  if (status === 404) return 'not-found';
  if (LIVE_PAGES.has(page)) return 'live';
  if (INDEX_PAGES.has(page)) return 'index';
  if (NEWS_RANGES.some((r) => page >= r.from && page <= r.to)) return 'news';
  return 'other';
}

export function limitFor(
  page: number,
  status: 200 | 404 = 200,
): { kind: PageKind; limitS: number } {
  const kind = kindOf(page, status);
  return { kind, limitS: LIMIT_S[kind] };
}

/** A browser or the app's HTTP cache never keeps a page longer than this. */
export const BROWSER_MAX_AGE_CAP_S = 120;

/**
 * `Cache-Control: max-age` for the browser: a quarter of the limit, at most
 * 120 s. A 60 s page is then at most 15 s old in a browser, and a 30 min TV
 * page is re-asked from the proxy (not from Yle) after 2 minutes, so a reader
 * who pulls to refresh never waits long for something the proxy already has.
 */
export function browserMaxAge(limitS: number): number {
  return Math.min(Math.floor(limitS / 4), BROWSER_MAX_AGE_CAP_S);
}

/** Yle's limit for the whole key, as far as we know (D39: not yet confirmed). */
export const YLE_REQUESTS_PER_HOUR = 300;
/** Over this share of the hour's budget, every limit is doubled. */
export const PRESSURE_SHARE = 0.7;
/**
 * Hard cap (PUB.6, D39 amendment): past this many Yle requests in one hour,
 * this Worker copy never asks Yle again until the next hour. It answers from
 * the cache, then the last good copy, else 503. Set below Yle's 300 an hour
 * (D39) so a script asking for hundreds of different pages can't use up the
 * key for everyone, with 50 to spare for other Worker copies and data
 * centres. Counted per Worker copy, like the doubling above, so it is a floor
 * of protection, not an exact total; the Cloudflare rate-limiting rule in
 * proxy/README.md is the first line.
 */
export const YLE_HOURLY_CAP = 250;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Counts this Worker's requests to Yle in the current UTC hour, in memory.
 * Best effort: Cloudflare may run several copies of the Worker in one data
 * centre, or restart it, and each copy counts on its own, so the real number
 * can be higher. Once the count passes 70 % of 300, `factor` is 2 for the rest
 * of the hour, and every limit is doubled; the next hour starts again at 1.
 * At `YLE_HOURLY_CAP`, `full` is true and the proxy stops asking Yle.
 */
export class YleBudget {
  private hour = -1;
  private count = 0;

  private roll(nowMs: number): void {
    const hour = Math.floor(nowMs / HOUR_MS);
    if (hour !== this.hour) {
      this.hour = hour;
      this.count = 0;
    }
  }

  /** One request sent to Yle (whatever the answer). */
  record(nowMs: number): void {
    this.roll(nowMs);
    this.count += 1;
  }

  /** Requests sent to Yle so far this hour. */
  used(nowMs: number): number {
    this.roll(nowMs);
    return this.count;
  }

  /** 2 when this hour's count has passed 70 % of 300, otherwise 1. */
  factor(nowMs: number): 1 | 2 {
    return this.used(nowMs) > YLE_REQUESTS_PER_HOUR * PRESSURE_SHARE ? 2 : 1;
  }

  /** True once this hour's count has reached `YLE_HOURLY_CAP`: no more requests to Yle this hour. */
  full(nowMs: number): boolean {
    return this.used(nowMs) >= YLE_HOURLY_CAP;
  }

  /** Whole seconds until the next UTC hour, when the count starts again (for `Retry-After`). */
  secondsToNextHour(nowMs: number): number {
    return Math.ceil((HOUR_MS - (nowMs % HOUR_MS)) / 1000);
  }
}
