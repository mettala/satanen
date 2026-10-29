import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { normalize } from '../parser/normalize';
import type { Line, Page } from '../parser/model';
import { extractIndexEntries, extractLineEntries, mergeEntries } from './extract';
import type { PageEntry } from './types';

const here = fileURLToPath(new URL('.', import.meta.url));
const pagesDir = resolve(here, '../../fixtures/pages');

function load(n: number): Page {
  const raw = JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8'));
  const result = normalize(raw);
  if (!result.ok) throw new Error(`fixture ${n}: ${result.error.message}`);
  return result.page;
}

function line(page: Page, subpage: number, row: number): Line {
  const sp = page.subpages.find((s) => s.number === subpage);
  const l = sp?.lines.find((x) => x.number === row);
  if (!l) throw new Error(`no line ${subpage}/${row} on page ${page.number}`);
  return l;
}

describe('extract: index rows', () => {
  it('reads one entry per column (200 line 5: 223 JÄÄKIEKKOLIIGA, 263 F-LIIGA)', () => {
    expect(extractLineEntries(line(load(200), 1, 5))).toEqual([
      { page: 223, title: 'JÄÄKIEKKOLIIGA' },
      { page: 263, title: 'F-LIIGA (M)' },
    ]);
  });

  it('reads the main index header + subsection (199 sp1 line 11)', () => {
    expect(extractLineEntries(line(load(199), 1, 11))).toEqual([
      { page: 201, title: 'Urheilu-uutiset' },
      { page: 460, title: 'Ravit' },
    ]);
  });

  it('reads a range as link, "-", link (160 line 18: 172-173 Korot)', () => {
    expect(extractLineEntries(line(load(160), 1, 18))).toEqual([
      { page: { from: 172, to: 173 }, title: 'Korot ja valuuttakurssit' },
    ]);
  });

  it('reads a comma list (199 sp2 line 8: 340,345-346 Yle Radio1)', () => {
    const entries = extractLineEntries(line(load(199), 2, 8));
    expect(entries).toEqual([
      { page: 304, title: 'Nelonen' },
      { page: 340, title: 'Yle Radio1' },
      { page: { from: 345, to: 346 }, title: 'Yle Radio1' },
    ]);
  });

  it('reads the section headers on the front page (100 line 18)', () => {
    const entries = extractLineEntries(line(load(100), 1, 18));
    expect(entries).toEqual([
      { page: 101, title: 'UUTISET' },
      { page: 160, title: 'TALOUS' },
      { page: 190, title: 'ENGLISH' },
    ]);
  });

  it('trims surrounding spaces of a title but keeps the text as-is (200 line 8)', () => {
    expect(extractLineEntries(line(load(200), 1, 8))).toEqual([
      { page: 230, title: 'U20 SM-SARJA' },
      { page: 270, title: 'EUROKORIS' },
    ]);
  });
});

function findLine(page: Page, includes: string): Line {
  for (const sp of page.subpages) {
    const l = sp.lines.find((x) => x.text.includes(includes));
    if (l) return l;
  }
  throw new Error(`no line containing "${includes}" on page ${page.number}`);
}

describe('extract: column gaps and sentence fragments', () => {
  it('ends a title at a column gap (160: "Talous    hakemisto")', () => {
    expect(extractLineEntries(findLine(load(199), '160 Talous'))[0]).toEqual({
      page: 160,
      title: 'Talous',
    });
  });

  it('ends a title at a column gap (510: "Pirkanmaa     Uusimaa")', () => {
    const entries = extractLineEntries(findLine(load(500), 'Pirkanmaa'));
    expect(entries[0]).toEqual({ page: 510, title: 'Pirkanmaa' });
    expect(entries.some((e) => e.title.includes('  '))).toBe(false);
  });

  it('drops a dash-only tail after a gap (Tv-ikärajat ----)', () => {
    const entries = extractLineEntries(findLine(load(500), 'Tv-ikärajat'));
    expect(entries).toEqual([{ page: 526, title: 'Tv-ikärajat' }]);
  });

  it('does not treat mid-sentence page numbers as entries (330: "310-317 ja")', () => {
    expect(extractLineEntries(findLine(load(330), 'Sivuilla 301'))).toEqual([]);
  });

  it('does not treat mid-sentence page numbers as entries (410: "411-413. Koko")', () => {
    expect(extractLineEntries(findLine(load(410), 'TIESÄÄtiedot sivuilla'))).toEqual([]);
  });

  it('still reads columns that touch with a single space (199: 306 Ava 307 Liv)', () => {
    expect(extractLineEntries(findLine(load(199), '306 Ava 307 Liv'))).toEqual([
      { page: 306, title: 'Ava' },
      { page: 307, title: 'Liv' },
      { page: 344, title: 'Yöklassinen' },
    ]);
  });
});

describe('extract: skipped rows', () => {
  it('ignores a page number with text only before it (100 line 22: Sää paikkakunnittain 406-408)', () => {
    expect(extractLineEntries(line(load(100), 1, 22))).toEqual([]);
  });

  it('ignores page links Yle marked inside mosaic graphics (890 line 2)', () => {
    expect(extractLineEntries(line(load(890), 1, 2))).toEqual([]);
  });

  it('ignores a row with no page links (103 line 6)', () => {
    expect(extractLineEntries(line(load(103), 1, 6))).toEqual([]);
  });

  it('ignores a title that is only punctuation (410 sp2 line 16: 415-417.)', () => {
    expect(extractLineEntries(line(load(410), 2, 16))).toEqual([]);
  });

  it('collects every subpage of the main index (199 has 4 subpages)', () => {
    const page = load(199);
    expect(page.subpageCount).toBe(4);
    const entries = extractIndexEntries(page);
    expect(entries.some((e) => e.page === 201)).toBe(true);
    // Section names from subpages 2-4 too (not only subpage 1).
    expect(entries.some((e) => e.page === 301)).toBe(true);
    expect(entries.some((e) => e.page === 400)).toBe(true);
    expect(entries.some((e) => e.page === 701)).toBe(true);
  });
});

describe('mergeEntries', () => {
  it('keeps the first title for a page and sorts by number', () => {
    const entries: PageEntry[] = [
      { page: 230, title: 'Liiga' },
      { page: 200, title: 'Urheilu' },
      { page: 230, title: 'U20 SM-SARJA' },
    ];
    expect(mergeEntries(entries)).toEqual([
      { page: 200, title: 'Urheilu' },
      { page: 230, title: 'Liiga' },
    ]);
  });

  it('orders a single page before a range with the same start', () => {
    const entries: PageEntry[] = [
      { page: { from: 406, to: 407 }, title: 'Sää paikkakunnittain' },
      { page: 406, title: 'Päivän sää' },
    ];
    expect(mergeEntries(entries).map((e) => e.title)).toEqual([
      'Päivän sää',
      'Sää paikkakunnittain',
    ]);
  });
});
