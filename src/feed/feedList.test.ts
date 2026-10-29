import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { classify, type ClassifiedLine } from '../parser/classify';
import type { Line, Page } from '../parser/model';
import { normalize } from '../parser/normalize';
import {
  FEED_IDS,
  FEED_PAGES,
  feedList,
  indexItems,
  isDateRow,
  serviceItems,
  type IndexPages,
} from './feedList';

const here = fileURLToPath(new URL('.', import.meta.url));
const pagesDir = resolve(here, '../../fixtures/pages');

function parse(file: string): Page {
  const result = normalize(JSON.parse(readFileSync(file, 'utf8')));
  if (!result.ok) throw new Error(`${file} does not normalise`);
  return result.page;
}

const load = (n: number): Page => parse(resolve(pagesDir, `${n}.json`));

const pages = (...list: Page[]): IndexPages => Object.fromEntries(list.map((p) => [p.number, p]));

const numbers = (items: { page: number }[]) => items.map((i) => i.page);

// ------------------------------------------------- hand-made page edits
// Edge cases are built from the real index pages so the rows look like Yle's.

function editRows(page: Page, rows: number[], edit: (line: Line) => void): Page {
  const copy = structuredClone(page);
  for (const sp of copy.subpages) {
    for (const line of sp.lines) {
      if (!rows.includes(line.number)) continue;
      edit(line);
      line.text = line.runs.map((r) => r.text).join('');
    }
  }
  return copy;
}

/** Replace the row with plain white text (no links). */
function setText(page: Page, row: number, text: string): Page {
  return editRows(page, [row], (line) => {
    line.runs = [
      {
        text: text.padEnd(40),
        hasText: text.trim() !== '',
        column: 0,
        length: 40,
        fg: 'white',
        bg: 'black',
        graphics: false,
        doubleHeight: false,
      },
    ];
  });
}

const blank = (page: Page, rows: number[]): Page =>
  rows.reduce((p, row) => setText(p, row, ''), page);

/** Point the row's page link (and its on-screen number) somewhere else. */
function retarget(page: Page, row: number, to: number): Page {
  return editRows(page, [row], (line) => {
    for (const run of line.runs) {
      if (run.link?.kind !== 'page') continue;
      run.link = { kind: 'page', page: to };
      run.text = run.text.replace(/\d{3}/, String(to));
    }
  });
}

/** Put another page's row (e.g. a range row) in place of a row. */
function copyRow(page: Page, row: number, from: Page, fromRow: number): Page {
  const copy = structuredClone(page);
  const line = from.subpages[0].lines.find((l) => l.number === fromRow)!;
  for (const sp of copy.subpages) {
    sp.lines = sp.lines.map((l) =>
      l.number === row ? { ...structuredClone(line), number: row } : l,
    );
  }
  return copy;
}

function rowOf(page: Page, row: number): ClassifiedLine {
  return classify(page)[0].lines.find((l) => l.number === row)!;
}

// Rows of the real fixtures (captured 21.10.2026).
const P102 = { date: 11, first: 12, last: 21 };
const P130 = { date: 13, first: 14 };
const P160 = { date: 9, serviceRange: 18 };
const P201 = { date: 10, first: 12 };

// ------------------------------------------------------ fixture lists

describe('feed lists on the saved index pages', () => {
  const all = pages(load(102), load(130), load(160), load(201));

  it('Kotimaa: the ten stories under "Keskiviikon uutisia:" on 102', () => {
    expect(numbers(feedList('kotimaa', all))).toEqual([
      103, 104, 105, 106, 107, 108, 109, 110, 111, 113,
    ]);
    expect(feedList('kotimaa', all)[0]).toEqual({
      page: 103,
      headline: 'Etelässä odotetaan lämpenemistä',
      section: 'news',
    });
  });

  it('Ulkomaat: the eight stories on 130', () => {
    expect(numbers(feedList('ulkomaat', all))).toEqual([131, 132, 133, 134, 135, 136, 137, 138]);
    expect(feedList('ulkomaat', all).every((i) => i.section === 'world')).toBe(true);
  });

  it('Uutiset: Kotimaa first, then Ulkomaat, 18 stories', () => {
    const items = feedList('uutiset', all);
    expect(items).toHaveLength(18);
    expect(items).toEqual([...feedList('kotimaa', all), ...feedList('ulkomaat', all)]);
  });

  it("Talous: 160's six stories, then its four service links (D40)", () => {
    const items = feedList('talous', all);
    // 172-173 rates, 174 world stock prices, 175-187 stock pages, 188-189 electricity.
    expect(numbers(items)).toEqual([161, 162, 163, 164, 165, 166, 172, 174, 175, 188]);
    expect(items.every((i) => i.section === 'business')).toBe(true);
    expect(items.slice(0, 6).every((i) => i.service === undefined)).toBe(true);
    expect(items.slice(6)).toEqual([
      { page: 172, headline: 'Korot ja valuuttakurssit', section: 'business', service: true },
      { page: 174, headline: 'Maailman pörssien kursseja', section: 'business', service: true },
      { page: 175, headline: 'Pörssisivut', section: 'business', service: true },
      { page: 188, headline: 'Pörssisähkön hinta', section: 'business', service: true },
    ]);
  });

  it('Urheilu: 201\'s nine stories under "Keskiviikko", without the promos above it', () => {
    const items = feedList('urheilu', all);
    expect(numbers(items)).toEqual([202, 203, 204, 205, 206, 221, 222, 241, 661]);
    // Promos: 235 NHL, 277-278 NBA (a range), 355 a TV match.
    expect(numbers(items)).not.toContain(235);
    expect(numbers(items)).not.toContain(355);
  });

  it('Urheilu: 661 is listed twice, the first headline is kept and labelled Urheilu', () => {
    expect(feedList('urheilu', all).at(-1)).toEqual({
      page: 661,
      headline: 'Como höykytti Man Unitedia UCL:ssä',
      section: 'sport',
    });
  });

  it('keeps every headline exactly as on the page', () => {
    for (const id of FEED_IDS) {
      for (const item of feedList(id, all)) {
        const rows = FEED_PAGES[id].flatMap((n) => all[n]!.subpages[0].lines.map((l) => l.text));
        // A service range shows as `172-173 Korot ja valuuttakurssit` and opens 172.
        const shown = rows.some(
          (row) =>
            row.includes(`${item.page} ${item.headline}`) ||
            (item.service && new RegExp(`${item.page}-\\d{3} ${item.headline}`).test(row)),
        );
        expect(shown, `${item.page} ${item.headline}`).toBe(true);
      }
    }
  });

  it('leaves out the coloured bottom bars (130 KOTIMAA, 160 TALOUS, 200 URHEILU…)', () => {
    for (const id of FEED_IDS) {
      for (const p of [102, 130, 160, 200, 220, 650]) {
        expect(numbers(feedList(id, all))).not.toContain(p);
      }
    }
  });
});

// ----------------------------------------------------------- date row

describe('isDateRow', () => {
  const base = load(102);
  const withRow = (text: string) => rowOf(setText(base, P102.date, text), P102.date);

  it.each(['Keskiviikon uutisia:', 'Keskiviikko', 'Lauantain uutisia 24.10.', ' SUNNUNTAI '])(
    '"%s" starts the day\'s list',
    (text) => {
      expect(isDateRow(withRow(text))).toBe(true);
    },
  );

  it.each(['Keskiviikkona Helsingissä satoi', 'Uutisia:', '21.10.', 'Tänään'])(
    '"%s" does not',
    (text) => {
      expect(isDateRow(withRow(text))).toBe(false);
    },
  );

  it('the weekday in the title area (102 row 2, TORSTAI) is a title, not a date row', () => {
    const row = rowOf(base, 2);
    expect(row.text.trim()).toBe('TORSTAI');
    expect(isDateRow(row)).toBe(false);
  });

  it('finds the date row on every saved index page', () => {
    expect(isDateRow(rowOf(base, P102.date))).toBe(true);
    expect(isDateRow(rowOf(load(130), P130.date))).toBe(true);
    expect(isDateRow(rowOf(load(160), P160.date))).toBe(true);
    expect(isDateRow(rowOf(load(201), P201.date))).toBe(true);
  });
});

// ----------------------------------------------------- hand-made cases

describe('feed list edge cases', () => {
  const p102 = load(102);
  const p130 = load(130);
  const p160 = load(160);
  const p201 = load(201);

  it('no date row: every headline row is used (102 is unchanged)', () => {
    const page = blank(p102, [P102.date]);
    expect(feedList('kotimaa', pages(page))).toEqual(feedList('kotimaa', pages(p102)));
  });

  it('no date row on 160: every story row, and the service links stay at the end', () => {
    const page = blank(p160, [P160.date]);
    expect(feedList('talous', pages(page))).toEqual(feedList('talous', pages(p160)));
  });

  it('no date row on 201: the promos come back, minus ranges and non-sport pages', () => {
    const page = blank(p201, [P201.date]);
    expect(numbers(feedList('urheilu', pages(page)))).toEqual([
      235, 202, 203, 204, 205, 206, 221, 222, 241, 661,
    ]);
  });

  it('a date row with no headline under it: every headline row is used', () => {
    // 201's date row moved below its list (row 22, above the bottom bar).
    const page = setText(blank(p201, [P201.date]), 22, 'Keskiviikko');
    expect(isDateRow(rowOf(page, 22))).toBe(true);
    expect(numbers(feedList('urheilu', pages(page)))).toEqual(
      numbers(feedList('urheilu', pages(blank(p201, [P201.date])))),
    );
  });

  it("the day's list ends at the first blank row", () => {
    const page = blank(p102, [P102.first + 3]);
    expect(numbers(feedList('kotimaa', pages(page)))).toEqual([103, 104, 105]);
  });

  it('a page listed twice is kept once, with its first headline', () => {
    const page = retarget(p102, P102.first + 1, 103);
    const items = feedList('kotimaa', pages(page));
    expect(numbers(items)).toEqual([103, 105, 106, 107, 108, 109, 110, 111, 113]);
    expect(items[0].headline).toBe('Etelässä odotetaan lämpenemistä');
  });

  it('a page range in the list is not an item', () => {
    const page = copyRow(p102, P102.first + 2, p160, P160.serviceRange);
    expect(rowOf(page, P102.first + 2).links[0].target).toEqual({
      kind: 'range',
      from: 172,
      to: 173,
    });
    expect(numbers(feedList('kotimaa', pages(page)))).toEqual([
      103, 104, 106, 107, 108, 109, 110, 111, 113,
    ]);
  });

  it('a link to an index page in the list is not an item', () => {
    const page = retarget(p102, P102.first, 130);
    expect(numbers(feedList('kotimaa', pages(page)))[0]).toBe(104);
  });

  it("Urheilu drops a non-sport page inside the day's list (a 3xx TV listing)", () => {
    const page = retarget(p201, P201.first + 1, 330);
    expect(numbers(feedList('urheilu', pages(page)))).not.toContain(330);
    expect(numbers(feedList('urheilu', pages(page)))).toHaveLength(8);
  });

  it('an empty page (no headline rows) gives an empty list', () => {
    const rows = Array.from({ length: P102.last - P102.date + 1 }, (_, i) => P102.date + i);
    expect(feedList('kotimaa', pages(blank(p102, rows)))).toEqual([]);
  });

  it('no index pages loaded: every feed is empty', () => {
    for (const id of FEED_IDS) expect(feedList(id, {})).toEqual([]);
  });

  it('Uutiset with only 102 loaded shows Kotimaa, with only 130 Ulkomaat', () => {
    expect(numbers(feedList('uutiset', pages(p102)))).toEqual(numbers(indexItems(p102)));
    expect(numbers(feedList('uutiset', pages(p130)))).toEqual(numbers(indexItems(p130)));
  });

  it('Uutiset keeps a page listed on both 102 and 130 once, in its Kotimaa place', () => {
    const items = feedList('uutiset', pages(p102, retarget(p130, P130.first, 103)));
    expect(items).toHaveLength(17);
    expect(items.filter((i) => i.page === 103)).toEqual([
      { page: 103, headline: 'Etelässä odotetaan lämpenemistä', section: 'news' },
    ]);
  });

  it('each subpage is read on its own: one without a date row gives all its headlines', () => {
    const second = blank(p130, [P130.date]).subpages[0];
    const page: Page = {
      ...structuredClone(p102),
      subpages: [structuredClone(p102.subpages[0]), { ...structuredClone(second), number: 2 }],
      subpageCount: 2,
    };
    expect(numbers(feedList('kotimaa', pages(page)))).toEqual([
      ...numbers(indexItems(p102)),
      ...numbers(indexItems(p130)),
    ]);
  });
});

// ------------------------------------------------- stories above the date row

describe('Kotimaa and Ulkomaat: new stories above the date row', () => {
  const p102 = load(102);
  const p130 = load(130);
  const p201 = load(201);
  // Early in the day Yle lists the new stories first, with no label, and the
  // date row heads the day before's (Tiistai: `131`-`135`, then
  // `Maanantain uutisia:` and `136`-`140`). Built from the saved pages by
  // moving the date row down to `row`, over that row's story.
  const movedDateRow = (page: Page, date: number, row: number): Page =>
    setText(blank(page, [date]), row, 'Maanantain uutisia:');
  const pageOf = (page: Page, row: number): number => {
    const link = rowOf(page, row).links[0].target;
    if (link.kind !== 'page') throw new Error('not a page link');
    return link.page;
  };

  it('Ulkomaat lists the unlabelled top block, then the labelled one', () => {
    const row = P130.first + 3; // 134
    const tuesday = movedDateRow(p130, P130.date, row);
    const full = numbers(indexItems(p130));
    const expected = full.filter((n) => n !== pageOf(p130, row));
    expect(numbers(feedList('ulkomaat', pages(tuesday)))).toEqual(expected);
    expect(expected.slice(0, 3)).toEqual([131, 132, 133]);
    // The date row alone would have left the new stories out.
    expect(numbers(indexItems(tuesday))).toEqual(expected.slice(3));
  });

  it('Kotimaa lists the unlabelled top block, then the labelled one', () => {
    const row = P102.first + 2;
    const tuesday = movedDateRow(p102, P102.date, row);
    const expected = numbers(indexItems(p102)).filter((n) => n !== pageOf(p102, row));
    expect(numbers(feedList('kotimaa', pages(tuesday)))).toEqual(expected);
    expect(numbers(indexItems(tuesday))).toEqual(expected.slice(2));
  });

  it('Uutiset is Kotimaa then Ulkomaat, both with their top blocks', () => {
    const k = movedDateRow(p102, P102.date, P102.first + 2);
    const u = movedDateRow(p130, P130.date, P130.first + 3);
    expect(feedList('uutiset', pages(k, u))).toEqual([
      ...feedList('kotimaa', pages(k)),
      ...feedList('ulkomaat', pages(u)),
    ]);
  });

  it('the coloured bottom bar and the title row above are never stories', () => {
    const tuesday = movedDateRow(p130, P130.date, P130.first + 3);
    const items = numbers(feedList('ulkomaat', pages(tuesday)));
    for (const n of [102, 160, 200]) expect(items).not.toContain(n);
  });

  it("Urheilu keeps only the day's list: 201's promos above its date row stay out", () => {
    const items = numbers(feedList('urheilu', pages(p201)));
    expect(items).not.toContain(235);
    expect(items).not.toContain(355);
  });
});

// ------------------------------------------------- Talous service links

describe('Talous service links (D40)', () => {
  const p102 = load(102);
  const p160 = load(160);
  const p201 = load(201);
  const STORIES = [161, 162, 163, 164, 165, 166];
  const SERVICES = [172, 174, 175, 188];
  const storyRows = Array.from({ length: 7 }, (_, i) => P160.date + i); // 9-15

  // Sunday 25.10.2026, live: no date row and no headlines, only the four
  // service rows 18-21 (identical to the weekday fixture's) above the bottom bar.
  const sunday = blank(p160, storyRows);

  it("Sunday: the feed is the four service links, in Yle's order", () => {
    const items = feedList('talous', pages(sunday));
    expect(numbers(items)).toEqual(SERVICES);
    expect(items.every((i) => i.service === true && i.section === 'business')).toBe(true);
    expect(items.map((i) => i.headline)).toEqual([
      'Korot ja valuuttakurssit',
      'Maailman pörssien kursseja',
      'Pörssisivut',
      'Pörssisähkön hinta',
    ]);
  });

  it('Sunday: no story is left (174 was the only item before D40)', () => {
    expect(indexItems(sunday, true)).toEqual([]);
    // Without the service rule 174 looked like a story.
    expect(numbers(indexItems(sunday))).toEqual([174]);
  });

  it('a range opens its first page: 172-173 → 172, 175-187 → 175, 188-189 → 188', () => {
    expect(rowOf(p160, P160.serviceRange).links[0].target).toEqual({
      kind: 'range',
      from: 172,
      to: 173,
    });
    expect(numbers(serviceItems(p160))).toEqual(SERVICES);
  });

  it('service links right under the stories (no blank row): the stories stay stories', () => {
    // The four service rows moved up from 18-21 to 16-19: rows 10-19 are one run.
    const moved = [16, 17, 18, 19].reduce((p, row) => copyRow(p, row, p160, row + 2), p160);
    const page = blank(moved, [20, 21]);
    expect(rowOf(page, 16).links[0].target).toMatchObject({ kind: 'range', from: 172 });
    const items = feedList('talous', pages(page));
    expect(numbers(items.filter((i) => !i.service))).toEqual(STORIES);
    expect(numbers(items.filter((i) => i.service))).toEqual(SERVICES);
  });

  it('a service page that is also a story is kept once, as the story', () => {
    const page = retarget(p160, 19, 161); // `174` row now points to 161
    const items = feedList('talous', pages(page));
    expect(items.filter((i) => i.page === 161)).toEqual([
      { page: 161, headline: 'Netflixin osake laskussa', section: 'business' },
    ]);
    expect(numbers(items)).toEqual([...STORIES, 172, 175, 188]);
  });

  it('a service link to an index page is not an item', () => {
    const page = retarget(p160, 19, 160);
    expect(numbers(feedList('talous', pages(page)))).toEqual([...STORIES, 172, 175, 188]);
  });

  it('no page range in the block: no service links, Talous is as before D40', () => {
    const noRanges = blank(p160, [18, 20, 21]);
    expect(numbers(feedList('talous', pages(noRanges)))).toEqual(STORIES);
    // On a Sunday that falls back to every headline row (174, as a story).
    const items = feedList('talous', pages(blank(noRanges, storyRows)));
    expect(items).toEqual([
      { page: 174, headline: 'Maailman pörssien kursseja', section: 'business' },
    ]);
  });

  it("no service rows at all: only the day's stories", () => {
    expect(numbers(feedList('talous', pages(blank(p160, [18, 19, 20, 21]))))).toEqual(STORIES);
  });

  it('only Talous has service links: the same rows in Kotimaa are left out as before', () => {
    expect(numbers(feedList('kotimaa', { 102: p160 }))).toEqual(STORIES);
    expect(numbers(feedList('kotimaa', { 102: sunday }))).toEqual([174]);
  });

  it('Uutiset and Urheilu never get service items (201 has a range promo, 277-278)', () => {
    for (const sport of [p201, blank(p201, [P201.date])]) {
      const all = pages(p102, load(130), sport);
      for (const id of ['kotimaa', 'ulkomaat', 'uutiset', 'urheilu'] as const) {
        expect(feedList(id, all).some((i) => i.service)).toBe(false);
      }
      expect(numbers(feedList('urheilu', all))).not.toContain(277);
    }
  });
});

// ------------------------------------------------ committed index pages

describe('feed lists on the committed index pages', () => {
  it('every feed is non-empty', () => {
    const all = pages(...[102, 130, 160, 201].map(load));
    for (const id of FEED_IDS) {
      expect(feedList(id, all), id).not.toEqual([]);
    }
  });
});
