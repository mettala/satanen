import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { frontPage } from '../front/frontPage';
import type { Page } from '../parser/model';
import { normalize } from '../parser/normalize';
import { FEED_PAGES, indexItems, type FeedItem } from './feedList';
import { etusivuItems } from './footer';
import { matchHeadline } from './headlineMatch';
import { pageHeadline } from './pageHeadline';

const here = fileURLToPath(new URL('.', import.meta.url));
const file = (n: number) => resolve(here, `../../fixtures/pages/${n}.json`);

function load(n: number): Page | null {
  if (!existsSync(file(n))) return null;
  const r = normalize(JSON.parse(readFileSync(file(n), 'utf8')));
  return r.ok ? r.page : null;
}

/** Every list item in the fixtures (Kotimaa, Ulkomaat, Talous, Urheilu, Etusivu) whose article is saved too. */
function listedWithArticle(): { list: string; item: FeedItem; article: Page }[] {
  const out: { list: string; item: FeedItem; article: Page }[] = [];
  const lists: [string, FeedItem[]][] = [...new Set(Object.values(FEED_PAGES).flat())].map((n) => [
    String(n),
    indexItems(load(n)!),
  ]);
  lists.push(['etusivu', etusivuItems(frontPage(load(100)!))]);
  for (const [list, items] of lists) {
    for (const item of items) {
      const article = load(item.page);
      if (article) out.push({ list, item, article });
    }
  }
  return out;
}

describe('matchHeadline over the fixtures (saved at the same time, so every pair is the same story)', () => {
  const pairs = listedWithArticle();

  it('has pairs from every list', () => {
    expect(new Set(pairs.map((p) => p.list))).toEqual(
      new Set(['102', '130', '160', '201', 'etusivu']),
    );
  });

  it('never says an article is another story than its list', () => {
    const wrong = pairs
      .filter((p) => matchHeadline(p.item.headline, pageHeadline(p.article)) === 'differs')
      .map((p) => `${p.list} ${p.item.page}`);
    expect(wrong).toEqual([]);
  });

  it('every article with a heading is the same story', () => {
    const withHeading = pairs.filter((p) => pageHeadline(p.article) !== undefined);
    expect(withHeading.length).toBeGreaterThanOrEqual(15);
    for (const p of withHeading) {
      expect(matchHeadline(p.item.headline, pageHeadline(p.article))).toBe('same');
    }
  });

  it('pages with no heading (bulletin 202, result tables 203 and 221) are unknown', () => {
    for (const n of [202, 203, 221]) {
      const p = pairs.find((x) => x.item.page === n)!;
      expect(matchHeadline(p.item.headline, pageHeadline(p.article))).toBe('unknown');
    }
  });

  it('136: Yle words the list and the article differently for the same story', () => {
    const article = pageHeadline(load(136)!);
    expect(article).toBe('Putin valmis neuvotteluihin');
    expect(matchHeadline('Putin: Olen valmis neuvotteluihin', article)).toBe('same');
  });

  it("Etusivu's capitals are the same story", () => {
    expect(
      matchHeadline('TEKSTI-TV:N NETTIVERSION KATKOS OHI', 'Teksti-tv:n nettiversion katkos ohi'),
    ).toBe('same');
  });

  it('a page number reused for another story differs (list 102 vs other articles)', () => {
    // 105 listed, while the cached copy is the article that was on 103, 104 or 110 earlier.
    const listed = indexItems(load(102)!).find((i) => i.page === 105)!.headline;
    for (const n of [103, 104, 109, 136, 161, 205]) {
      expect(matchHeadline(listed, pageHeadline(load(n)!))).toBe('differs');
    }
  });

  it('a story about the same thing that shares only one word differs', () => {
    // 110 and 105 are both about the Jyväskylä fire; only "Jyväskylän" is shared.
    expect(matchHeadline('Yksi kuoli Jyväskylän palossa', pageHeadline(load(110)!))).toBe(
      'differs',
    );
  });
});

describe('matchHeadline rules', () => {
  it.each([
    ['same text', 'Witkoff tapasi Putinin', 'Witkoff tapasi Putinin', 'same'],
    ['spaces and case', '  witkoff   TAPASI putinin ', 'Witkoff tapasi Putinin', 'same'],
    [
      'punctuation',
      'Epäily: Jyväskylän palo tahallinen',
      'Epäily Jyväskylän palo tahallinen?',
      'same',
    ],
    ['Finnish endings', 'Sarkkinen jatkaa Tapparassa', 'Sarkkisen jatko Tapparassa', 'same'],
    [
      'one shared word of a two-word headline',
      'Pariisiin ulkonaliikkumiskielto',
      'Ulkonaliikkumiskielto Lyonissa',
      'differs',
    ],
    [
      'a one-word list headline found in the article',
      'Urheilusähkeitä',
      'Urheilusähkeitä tänään',
      'same',
    ],
    ['no heading on the page', 'Witkoff tapasi Putinin', undefined, 'unknown'],
    ['nothing to compare on the list', 'F1', 'F1-kisan tulokset', 'unknown'],
    ['nothing to compare in the article', 'Witkoff tapasi Putinin', '1-0', 'unknown'],
  ] as const)('%s', (_name, listed, article, expected) => {
    expect(matchHeadline(listed, article)).toBe(expected);
  });
});
