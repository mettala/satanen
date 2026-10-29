import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  classify,
  hasWord,
  isBracketNote,
  isDecorationRun,
  nameLinkRow,
  type ClassifiedLine,
  type LineKind,
  type ReaderLink,
} from './classify';
import { LINE_WIDTH, MAX_LINE, type Page } from './model';
import { normalize } from './normalize';

const here = fileURLToPath(new URL('.', import.meta.url));
const pagesDir = resolve(here, '../../fixtures/pages');

/**
 * Fixture page `n`. With `structuredOnly`, Yle's `all` content is left out, so
 * normalize cannot find mosaic cells that `structured` sent as plain text
 * (RP.8): what the rules below see when `all` is missing or does not match.
 */
function load(n: number | string, structuredOnly = false): Page | undefined {
  const raw = JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8'));
  if (structuredOnly) {
    for (const sp of [raw.teletext.page.subpage].flat()) {
      sp.content = sp.content.filter((c: { type: string }) => c.type !== 'all');
    }
  }
  const result = normalize(raw);
  return result.ok ? result.page : undefined;
}

const cache = new Map<string, ReturnType<typeof classify>>();
function classified(n: number, structuredOnly = false) {
  const key = `${n}${structuredOnly ? '/structured' : ''}`;
  let c = cache.get(key);
  if (!c) {
    const page = load(n, structuredOnly);
    if (!page) throw new Error(`fixture ${n} does not normalise`);
    c = classify(page);
    cache.set(key, c);
  }
  return c;
}

/** Classified row `row` of subpage `sp` on fixture page `n`. */
function row(n: number, sp: number, r: number, structuredOnly = false): ClassifiedLine {
  const l = classified(n, structuredOnly)
    .find((s) => s.number === sp)
    ?.lines.find((x) => x.number === r);
  if (!l) throw new Error(`no row ${sp}/${r} on ${n}`);
  return l;
}

function is(n: number, sp: number, r: number, structuredOnly = false) {
  const l = row(n, sp, r, structuredOnly);
  return { kind: l.kind, rule: l.rule };
}

function targets(l: ClassifiedLine): ReaderLink[] {
  return l.links.map((x) => x.target);
}

const page = (p: number): ReaderLink => ({ kind: 'page', page: p });
const range = (from: number, to: number): ReaderLink => ({ kind: 'range', from, to });

describe('classify: header and decoration', () => {
  it('drops row 1, the header bar, even when it holds a link (103 row 1, 714 row 1)', () => {
    expect(is(103, 1, 1)).toEqual({ kind: 'drop', rule: 'header-row' });
    expect(is(714, 1, 1)).toEqual({ kind: 'drop', rule: 'header-row' });
  });

  it('drops the text-less copy row of a double-height line (103 row 4, 100 row 7)', () => {
    expect(is(103, 1, 4)).toEqual({ kind: 'drop', rule: 'double-height-copy' });
    // 100 row 7 still carries the link to 136, but row 6 already has it.
    expect(row(100, 1, 7).line.runs.some((r) => r.link)).toBe(true);
    expect(is(100, 1, 7)).toEqual({ kind: 'drop', rule: 'double-height-copy' });
  });

  it('drops rows that are only mosaic graphics (100 rows 5 and 17)', () => {
    expect(is(100, 1, 5)).toEqual({ kind: 'drop', rule: 'graphics-only' });
    expect(is(100, 1, 17)).toEqual({ kind: 'drop', rule: 'graphics-only' });
  });

  it('marks empty rows blank (103 row 2)', () => {
    expect(is(103, 1, 2)).toEqual({ kind: 'blank', rule: 'blank' });
  });

  it('keeps title rows under the header as titles (199 row 2, 401 rows 2-3, 175 row 3)', () => {
    expect(row(199, 1, 2).text).toContain('Päähakemistojen kooste');
    expect(is(199, 1, 2)).toEqual({ kind: 'title', rule: 'title-row' });
    expect(row(401, 1, 2).text).toContain('Ilmatieteen laitos 21.10.');
    expect(is(401, 1, 2)).toEqual({ kind: 'title', rule: 'title-row' });
    expect(row(401, 1, 3).text).toContain('Säätiedotus klo 22');
    expect(is(401, 1, 3)).toEqual({ kind: 'title', rule: 'title-row' });
    expect(is(175, 1, 3)).toEqual({ kind: 'title', rule: 'title-row' });
  });

  it('keeps the TV-guide day of each subpage (301 subpage 2 row 2: Torstai 22.10.)', () => {
    expect(row(301, 1, 2).text).toContain('Keskiviikko 21.10.');
    expect(row(301, 2, 2).text).toContain('Torstai 22.10.');
    expect(is(301, 2, 2)).toEqual({ kind: 'title', rule: 'title-row' });
  });

  it('drops title-band rows with no word or number: logo pieces (700 row 3, 799 row 3)', () => {
    // Yle's `all` content shows these logo pieces in graphics mode, so they are
    // graphics runs; without `all` the title-band rule still drops them.
    expect(is(700, 1, 3)).toEqual({ kind: 'drop', rule: 'graphics-only' });
    expect(is(799, 1, 3)).toEqual({ kind: 'drop', rule: 'graphics-only' });
    expect(is(700, 1, 3, true)).toEqual({ kind: 'drop', rule: 'title-row' });
    expect(is(799, 1, 3, true)).toEqual({ kind: 'drop', rule: 'title-row' });
  });

  it('ends the header band at the first plain row: 725 row 2 is article text', () => {
    expect(is(725, 1, 2)).toEqual({ kind: 'paragraph', rule: 'text' });
  });

  it('keeps header-band rows that hold links (199 subpage 3 row 3, 400 row 4)', () => {
    expect(is(199, 3, 3)).toEqual({ kind: 'nav', rule: 'link-column' });
    expect(targets(row(199, 3, 3))).toEqual([page(404)]);
    expect(is(400, 1, 4)).toEqual({ kind: 'headline', rule: 'link-title' });
  });

  it('keeps a header-band row that is a table header (406 row 3: klo 18 klo 00 klo 06)', () => {
    expect(is(406, 1, 3)).toEqual({ kind: 'table', rule: 'columns' });
  });

  it('drops rows of symbols or mosaic codes sent as plain text (101 row 16, 420 rows 6 and 21)', () => {
    expect(is(101, 1, 16)).toEqual({ kind: 'drop', rule: 'decoration-text' });
    // 420 rows 6 and 21 without Yle's `all` content: the mosaic codes arrive as text.
    expect(row(420, 1, 21, true).text).toContain('ppsssssssssssss3##');
    expect(is(420, 1, 21, true)).toEqual({ kind: 'drop', rule: 'decoration-text' });
    expect(row(420, 1, 6, true).text).toContain('0j}|ij');
    expect(is(420, 1, 6, true)).toEqual({ kind: 'drop', rule: 'decoration-text' });
    // With `all`, row 21 is graphics: nothing is left once it is blanked.
    expect(is(420, 1, 21)).toEqual({ kind: 'drop', rule: 'graphics-only' });
    expect(is(420, 1, 6).kind).toBe('drop');
  });

  it('does not drop short letter rows or text with = and quotes (302/3 row 9, 402/2 row 21, 725/3 row 5)', () => {
    expect(row(302, 3, 9).text.trim()).toBe('T A');
    expect(row(302, 3, 9).kind).toBe('table');
    expect(is(402, 2, 21)).toEqual({ kind: 'paragraph', rule: 'text' });
    expect(is(725, 3, 5)).toEqual({ kind: 'paragraph', rule: 'text' });
  });

  it('treats a run holding DEL as decoration even when it is not graphics (420 row 7, 890 row 6)', () => {
    // Without Yle's `all` content (with it, normalize marks these cells as graphics).
    const r420 = row(420, 1, 7, true);
    const delRun = r420.line.runs.find((r) => r.text.includes('\x7f'));
    expect(delRun?.graphics).toBe(false);
    expect(isDecorationRun(delRun!)).toBe(true);
    expect(r420.text).not.toContain('\x7f');
    expect(r420.kind).toBe('drop');
    expect(is(890, 1, 6)).toEqual({ kind: 'drop', rule: 'graphics-only' });
  });

  it('uses the graphics flag, not "fg starts with g": green page numbers stay (199 row 5)', () => {
    const l = row(199, 1, 5);
    expect(l.line.runs.some((r) => r.fg === 'green' && !r.graphics && r.link)).toBe(true);
    expect(targets(l)).toEqual([page(100), page(175)]);
  });

  it('drops links that sit on graphics runs (890 row 2: digits inside mosaic art)', () => {
    expect(row(890, 1, 2).line.runs.some((r) => r.graphics && r.link)).toBe(true);
    expect(row(890, 1, 2).links).toEqual([]);
  });
});

describe('classify: graphics cells sent as plain text (RP.8)', () => {
  it('891: the big date and sun picture are graphics, so their rows are dropped', () => {
    for (const r of [2, 3, 4, 5, 8])
      expect(is(891, 1, r)).toEqual({ kind: 'drop', rule: 'graphics-only' });
  });

  it('891: the header lines keep only their words', () => {
    expect(row(891, 1, 6).text.trim()).toBe('ON SUNNUNTAI 25.10.2026');
    expect(row(891, 1, 7).text.trim()).toBe('KESÄAIKA PÄÄTTYY');
    expect(is(891, 1, 6)).toEqual({ kind: 'paragraph', rule: 'text' });
  });

  it('891: the sunrise table keeps its words and columns exactly', () => {
    expect(row(891, 1, 9).text).toBe(' '.repeat(14) + 'AURINKO   NOUSEE LASKEE   ');
    expect(row(891, 1, 10).text).toBe(' '.repeat(14) + 'Helsinki   7.25   16.43   ');
    for (const r of [9, 10, 11, 12, 13, 14]) expect(row(891, 1, r).kind).toBe('table');
  });

  it('890 row 5, 700 row 2, 799 row 2: the logo next to the words is graphics', () => {
    expect(row(890, 1, 5).text.trim()).toBe('KALENTERI');
    expect(row(700, 1, 2).text.trim()).toBe('svenska.yle.fi');
    expect(row(799, 1, 2).text.trim()).toBe('PÅ SVENSKA:');
  });
});

describe('classify: links, headlines and navigation', () => {
  it('reads "number + title" as a headline (102 row 12, 201 row 6 with a range)', () => {
    expect(is(102, 1, 12)).toEqual({ kind: 'headline', rule: 'link-title' });
    expect(row(102, 1, 12).links[0]).toMatchObject({
      target: page(103),
      label: 'Etelässä odotetaan lämpenemistä',
    });
    expect(is(201, 1, 6)).toEqual({ kind: 'headline', rule: 'link-title' });
    expect(targets(row(201, 1, 6))).toEqual([range(277, 278)]);
  });

  it('reads a double-height "number + title" as a headline, not a heading (100 row 6)', () => {
    expect(is(100, 1, 6)).toEqual({ kind: 'headline', rule: 'link-title' });
  });

  it('does not take a number starting a sentence for a headline (162 row 22, 417/1 row 11)', () => {
    expect(row(162, 1, 22).text).toContain('161 prosenttia');
    expect(is(162, 1, 22)).toEqual({ kind: 'paragraph', rule: 'text' });
    expect(is(417, 1, 11)).toEqual({ kind: 'paragraph', rule: 'text' });
  });

  it('does not read digits inside a number as page links (174)', () => {
    // "-439,32", "62 734,60", "-190,10": Yle marks the 3-digit parts as links.
    expect(row(174, 1, 4).links).toEqual([]);
    expect(row(174, 1, 5).links).toEqual([]);
    expect(row(174, 1, 11).links).toEqual([]);
    expect(row(174, 1, 16).links).toEqual([]);
    // 175 row 23, `OMXH 13 206,91`, is a number too.
    expect(row(175, 1, 23).links).toEqual([]);
    for (const r of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]) {
      expect(row(174, 1, r).kind).toBe('table');
    }
  });

  it('reads counts inside a sentence as running text, not link rows (202/2 row 8)', () => {
    // "urallaan 120 NHL-ottelua ja 126 AHL-": Yle marks both game counts as links.
    const l = row(202, 2, 8);
    expect(targets(l)).toEqual([page(120), page(126)]);
    expect(is(202, 2, 8)).toEqual({ kind: 'paragraph', rule: 'running-text' });
    // A capitalised row start is left to the link rules.
    expect(is(202, 2, 7)).toEqual({ kind: 'paragraph', rule: 'text' });
    // A page reference on such a row stays a link (blocks.test.ts): "sivulle 414".
    expect(row(410, 2, 13).text).toContain('sivulle 414');
    expect(is(410, 2, 13)).toEqual({ kind: 'paragraph', rule: 'running-text' });
  });

  it('keeps a wrapped index entry with a link a continuation, not running text (400 row 11)', () => {
    // "tänään & 3 vrk (selitteet 419)" under "406-407 Sää paikkakunnittain:".
    expect(targets(row(400, 1, 11))).toEqual([page(419)]);
    expect(is(400, 1, 11)).toEqual({ kind: 'headline', rule: 'continuation' });
  });

  it('never reads a row of an index page as running text (100, 101, 102, 199, 200, 201, 575)', () => {
    for (const n of [100, 101, 102, 199, 200, 201, 575]) {
      const rules = classified(n).flatMap((sp) => sp.lines.map((l) => l.rule));
      expect(rules, `page ${n}`).not.toContain('running-text');
    }
  });

  it('reads two-column index rows as nav (199 rows 4 and 8)', () => {
    expect(is(199, 1, 4)).toEqual({ kind: 'nav', rule: 'link-columns' });
    expect(row(199, 1, 4).links.map((l) => l.label)).toEqual(['UUTISET', 'Vaaratiedotteet']);
    // "160 Talous   hakemisto": the right column continues the row above.
    expect(is(199, 1, 8)).toEqual({ kind: 'nav', rule: 'link-columns' });
  });

  it('gives comma-joined links the shared name (199/2 row 8, 199/3 row 19)', () => {
    expect(row(199, 2, 8).links.map((l) => [l.target, l.label])).toEqual([
      [page(304), 'Nelonen'],
      [page(340), 'Yle Radio1'],
      [range(345, 346), 'Yle Radio1'],
    ]);
    expect(is(199, 3, 19)).toEqual({ kind: 'headline', rule: 'link-title' });
  });

  it('reads a named link standing in the right-hand column as nav (199 row 22, 199/3 row 12)', () => {
    expect(is(199, 1, 22)).toEqual({ kind: 'nav', rule: 'link-column' });
    expect(is(199, 3, 12)).toEqual({ kind: 'nav', rule: 'link-column' });
  });

  it('reads "name   link" at the end of a row as nav, but not ranked table rows (419 row 22, 298 row 5)', () => {
    expect(is(419, 1, 22)).toEqual({ kind: 'nav', rule: 'link-column' });
    expect(row(419, 1, 22).links[0]).toMatchObject({ target: page(400), label: 'Säähakemisto' });
    expect(is(298, 1, 5)).toEqual({ kind: 'table', rule: 'columns' });
  });

  it('reads rows of bare links as nav (101 row 14, 190 row 13)', () => {
    expect(is(101, 1, 14)).toEqual({ kind: 'nav', rule: 'link-only' });
    expect(targets(row(101, 1, 14))).toEqual([{ kind: 'url', href: 'https://yle.fi/uutiset' }]);
    expect(is(190, 1, 13)).toEqual({ kind: 'nav', rule: 'link-only' });
  });

  it('reads coloured bottom bars as nav (100 rows 18 and 22)', () => {
    expect(is(100, 1, 18)).toEqual({ kind: 'nav', rule: 'coloured-nav' });
    expect(row(100, 1, 18).links.map((l) => [l.target, l.label])).toEqual([
      [page(101), 'UUTISET'],
      [page(160), 'TALOUS'],
      [page(190), 'ENGLISH'],
    ]);
    expect(row(100, 1, 22).links).toMatchObject([
      { target: range(406, 408), text: '406-408', label: 'Sää paikkakunnittain' },
    ]);
  });

  it('merges "196 - 198" with spaces into one range (101 row 23)', () => {
    expect(row(101, 1, 23).links).toMatchObject([{ target: range(196, 198), text: '196 - 198' }]);
  });

  it('does not merge a score like 185-127 into a range (260 row 5)', () => {
    expect(targets(row(260, 1, 5))).toEqual([page(185), page(127)]);
  });

  it('drops the >>> next-subpage arrow (199/2 row 23) but keeps the range before it', () => {
    const l = row(199, 2, 23);
    expect(l.line.runs.some((r) => r.link?.kind === 'other')).toBe(true);
    expect(targets(l)).toEqual([range(196, 198)]);
    expect(l.text).not.toContain('>>>');
    // The last subpage has no arrow.
    expect(row(199, 4, 23).line.text).not.toContain('>>>');
  });
});

describe('classify: headings, tables, paragraphs', () => {
  it('reads double-height text as a heading (103 row 3)', () => {
    expect(is(103, 1, 3)).toEqual({ kind: 'heading', rule: 'double-height' });
  });

  it('reads article text as paragraphs (103 rows 6-23)', () => {
    const kinds = classified(103)[0]
      .lines.filter((l) => l.number >= 6)
      .map((l) => l.kind);
    expect(new Set(kinds)).toEqual(new Set<LineKind>(['paragraph', 'blank']));
  });

  it('reads "Home - Away   score/time" as a table row (246 row 5, 242 row 13)', () => {
    expect(is(246, 1, 5)).toEqual({ kind: 'table', rule: 'match-row' });
    expect(is(242, 1, 13)).toEqual({ kind: 'table', rule: 'match-row' });
  });

  it('reads column-aligned rows as tables (230 row 3, 404 row 3, 298/2 row 17 without digits)', () => {
    expect(is(230, 1, 3)).toEqual({ kind: 'table', rule: 'columns' });
    expect(is(404, 1, 3)).toEqual({ kind: 'table', rule: 'columns' });
    expect(is(298, 2, 17)).toEqual({ kind: 'table', rule: 'columns' });
  });

  it('reads "name   number" rows as tables (263/3 row 18, 298 row 16)', () => {
    expect(is(263, 3, 18)).toEqual({ kind: 'table', rule: 'number-column' });
    expect(is(298, 1, 16)).toEqual({ kind: 'table', rule: 'number-column' });
  });

  it('reads TV guide rows starting with a time as a table (301 row 4)', () => {
    expect(is(301, 1, 4)).toEqual({ kind: 'table', rule: 'time-row' });
  });

  it('joins looser rows to the table next to them (408 row 4, 233/3 row 3, 298/2 row 9)', () => {
    expect(is(408, 1, 4)).toEqual({ kind: 'table', rule: 'table-neighbour' });
    expect(is(233, 3, 3)).toEqual({ kind: 'table', rule: 'table-neighbour' });
    expect(row(298, 2, 9).text).toContain('Bahrain');
    expect(is(298, 2, 9)).toEqual({ kind: 'table', rule: 'table-neighbour' });
  });

  it('reads a column header above a table as part of it (298/2 row 3)', () => {
    expect(row(298, 2, 3).text).toContain('Voittaja');
    expect(is(298, 2, 3)).toEqual({ kind: 'table', rule: 'table-header' });
    expect(is(298, 4, 3)).toEqual({ kind: 'table', rule: 'table-header' });
  });

  it('puts a date row right above a table into the table (242 row 12, 270 row 14)', () => {
    expect(is(242, 1, 12)).toEqual({ kind: 'table', rule: 'table-date' });
    expect(is(270, 1, 14)).toEqual({ kind: 'table', rule: 'table-date' });
  });

  it('keeps bracketed notes between table rows in the table (235: assists under goal scorers)', () => {
    expect(row(235, 1, 6).text.trim()).toBe('(Koivunen)');
    expect(is(235, 1, 6)).toEqual({ kind: 'table', rule: 'table-note' });
    expect(is(235, 3, 6)).toEqual({ kind: 'table', rule: 'table-note' });
    // Two in a row-by-row chain (16 between table rows, 18 after one).
    expect(is(235, 3, 16)).toEqual({ kind: 'table', rule: 'table-note' });
    expect(is(235, 3, 18)).toEqual({ kind: 'table', rule: 'table-note' });
    // A name that runs into its minute, then the note.
    expect(row(235, 4, 5).text.trim()).toBe('Nugent-Hopkins24 (Aho)');
    expect(is(235, 4, 5)).toEqual({ kind: 'table', rule: 'table-note' });
    // No table on 235 is split by a paragraph any more.
    for (const sp of classified(235)) {
      expect(sp.lines.filter((l) => l.kind === 'paragraph').map((l) => l.number)).toEqual([]);
    }
  });

  it('does not take other text next to a table for a note (230 footnote, 242 caption)', () => {
    expect(is(230, 1, 22)).toEqual({ kind: 'paragraph', rule: 'text' });
    expect(is(242, 1, 3)).toEqual({ kind: 'paragraph', rule: 'text' });
  });

  it('continues wrapped headlines, nav rows and TV programmes (460 row 5, 300 row 21, 301 row 10)', () => {
    expect(is(460, 1, 5)).toEqual({ kind: 'headline', rule: 'continuation' });
    expect(is(300, 1, 21)).toEqual({ kind: 'nav', rule: 'continuation' });
    expect(is(301, 1, 10)).toEqual({ kind: 'table', rule: 'continuation' });
  });

  it('does not continue rows that are not indented further, or are footers (410 row 16, 263/2 row 23, 799 row 21)', () => {
    expect(row(410, 1, 16).text.trim()).toBe('TIETYÖT');
    expect(is(410, 1, 16)).toEqual({ kind: 'paragraph', rule: 'text' });
    // `Otteluseuranta s. 261` under a match row: its own link row, not a continuation.
    expect(is(263, 2, 23)).toEqual({ kind: 'nav', rule: 'page-ref' });
    expect(is(799, 1, 21)).toEqual({ kind: 'paragraph', rule: 'text' });
  });

  it('does not rely on topType: the main index 199 says "normal" but reads as nav', () => {
    expect(load(199)?.topType).toBe('normal');
    const kinds = classified(199)[0].lines.map((l) => l.kind);
    expect(kinds.filter((k) => k === 'nav').length).toBeGreaterThan(15);
    expect(kinds).not.toContain('paragraph');
  });
});

describe('classify: page references and next-subpage hints (RP.6)', () => {
  const labels = (n: number, sp: number, r: number) =>
    row(n, sp, r).links.map((l) => [l.label, l.pageRef ?? false]);

  it('names a link after a page word by the words before it (408, 891, 196, 189)', () => {
    // `21.10. klo 15.30  selitteet s.419`: back to the wide gap only.
    expect(labels(408, 1, 2)).toEqual([['selitteet', true]]);
    expect(labels(891, 1, 23)).toEqual([['Ajatus päivälle', true]]);
    expect(targets(row(891, 1, 23))).toEqual([page(895)]);
    // `på s.` and two spaces before the number.
    expect(labels(196, 1, 23)).toEqual([['Svenska sidor index', true]]);
    expect(targets(row(196, 1, 23))).toEqual([page(799)]);
    // Two references on one bar, the second after a comma.
    expect(labels(196, 2, 23)).toEqual([
      ['M-S', true],
      ['T-Y', true],
    ]);
    expect(is(196, 2, 23)).toEqual({ kind: 'nav', rule: 'coloured-nav' });
    expect(labels(189, 2, 23)).toEqual([['Keskihinnat', true]]);
  });

  it('leaves names that only look like page words alone (575, 196, 419, 330)', () => {
    // A wide gap after `sivu`: it ends 579's name, it does not name 572.
    expect(labels(575, 1, 10)).toEqual([
      ['Valkoinen sivu', false],
      ['Keltainen sivu', false],
    ]);
    // `sivut` is part of the name.
    expect(labels(196, 1, 21)).toEqual([['DX-kuuntelijoiden sivut', false]]);
    // No words before `Sivulla`: the name after the link is kept.
    expect(labels(419, 1, 23)).toEqual([['Eurooppa & muu maailma', false]]);
    // In a sentence the row stays a paragraph; blocks.ts links the numbers.
    expect(is(330, 1, 11)).toEqual({ kind: 'paragraph', rule: 'text' });
    expect(is(410, 2, 12)).toEqual({ kind: 'paragraph', rule: 'text' });
  });

  it('page-ref: a row of nothing but `Name s. 123` is a link row (189, 242, 263, 425)', () => {
    expect(is(189, 2, 23)).toEqual({ kind: 'nav', rule: 'page-ref' });
    expect(is(189, 3, 23)).toEqual({ kind: 'nav', rule: 'page-ref' });
    expect(is(242, 4, 20)).toEqual({ kind: 'nav', rule: 'page-ref' });
    expect(is(263, 1, 21)).toEqual({ kind: 'nav', rule: 'page-ref' });
    expect(is(425, 1, 22)).toEqual({ kind: 'nav', rule: 'page-ref' });
    expect(targets(row(425, 1, 22))).toEqual([range(426, 427)]);
    // No page word: not a page reference (`Tuntikeskihinnat 188`, 189/1).
    expect(is(189, 1, 23)).toEqual({ kind: 'paragraph', rule: 'text' });
  });

  it('next-hint: blanks `Huomenna klo 00-12 >>` when another subpage starts that way (189)', () => {
    expect(row(189, 2, 23).text.trimEnd()).toBe(' Keskihinnat s.188');
    expect(row(189, 3, 23).text.trimEnd()).toBe(' Keskihinnat s.188');
    // `Tänään klo 12-24 >` points at subpage 2, `Tänään klo 00-12 >` back at 1.
    expect(row(189, 1, 23).text.trimEnd()).toBe(' Tuntikeskihinnat 188');
    expect(row(189, 4, 23).text.trimEnd()).toBe(' Tuntikeskihinnat 188');
    // The rows they point at keep their text.
    expect(row(189, 3, 4).text.trim()).toBe('Huomenna klo 00-12 (hinta 15min välein)');
  });

  it('next-hint: keeps the hint when no other subpage has its words', () => {
    const p = load(189)!;
    const [sp] = classify({ ...p, subpages: [p.subpages[1]], subpageCount: 1 });
    const r = sp.lines.find((l) => l.number === 23)!;
    expect(r.text.trimEnd()).toBe(' Keskihinnat s.188 Huomenna klo 00-12 >>');
    expect(r.kind).toBe('paragraph');
  });

  it('next-hint: an arrow row elsewhere is not content to match (425 `Turku   >>>`)', () => {
    expect(row(425, 1, 18).text.trim()).toBe('Turku   >>>');
    expect(is(425, 1, 18)).toEqual({ kind: 'drop', rule: 'board-arrow' });
  });
});

describe('classify: index rows (RP.7)', () => {
  const labels = (n: number, sp: number, r: number) =>
    row(n, sp, r).links.map((l) => [l.text, l.label, l.pageRef ?? false]);
  const shape = (n: number, sp: number, r: number) => {
    const l = row(n, sp, r);
    return nameLinkRow(l.text, l.links);
  };
  const names = (n: number, sp: number, r: number) =>
    shape(n, sp, r)?.parts.map((p) => [p.name, p.links.map((l) => l.text)]);

  it('name-link: `Name 123` rows of the alphabetical index are link rows (196, 197, 198)', () => {
    expect(is(196, 1, 5)).toEqual({ kind: 'nav', rule: 'name-link' });
    expect(labels(196, 1, 5)).toEqual([['399', 'Aamu-tv:n aiheet', false]]);
    expect(labels(196, 1, 12)).toEqual([['386-395', 'Areena', false]]);
    expect(targets(row(196, 1, 12))).toEqual([range(386, 395)]);
    // Every number of a list is its own link, named by the entry.
    expect(labels(196, 1, 19)).toEqual([
      ['577', 'DIGITA tiedottaa', false],
      ['582', 'DIGITA tiedottaa', false],
      ['588', 'DIGITA tiedottaa', false],
    ]);
    // Two spaces before the number (link-column before RP.7), lower case, digits first.
    expect(is(196, 3, 9)).toEqual({ kind: 'nav', rule: 'name-link' });
    expect(is(197, 3, 4)).toEqual({ kind: 'nav', rule: 'name-link' });
    expect(is(197, 3, 18)).toEqual({ kind: 'nav', rule: 'name-link' });
    // Every entry row of the three pages: only the bars, headers and blank rows are not.
    for (const n of [196, 197, 198]) {
      for (const sp of classified(n)) {
        for (const l of sp.lines) {
          if (l.number < 4 || l.number > 21 || l.links.length === 0) continue;
          const where = `${n}/${sp.number} row ${l.number}`;
          expect(l.rule === 'name-link' || l.rule === 'link-only', where).toBe(true);
        }
      }
    }
  });

  it('name-link: `Valkoinen sivu 579` on the index is a name, not a page reference (198)', () => {
    expect(is(198, 3, 10)).toEqual({ kind: 'nav', rule: 'name-link' });
    expect(labels(198, 3, 10)).toEqual([['579', 'Valkoinen sivu', false]]);
  });

  it('name-link: each name takes the numbers after it (197, 196)', () => {
    expect(names(197, 3, 14)).toEqual([
      ['Säätiedotus', ['401']],
      ['5 vrk ennuste', ['405']],
    ]);
    expect(names(197, 3, 4)).toEqual([
      ['pohjoissaami', ['520']],
      ['inarinsaami', ['521']],
    ]);
    expect(names(196, 3, 19)).toEqual([
      ['Lintutilanne', ['888']],
      ['Lista', ['804']],
    ]);
    // `(selitteet 419)`: the bracket is left out of the name, `)` ends the row.
    expect(names(197, 3, 18)).toEqual([
      ['3 vrk', ['407']],
      ['selitteet', ['419']],
    ]);
    expect(names(197, 2, 14)).toEqual([['Radio Yle Radio 1', ['340', '344-346']]]);
    expect(names(197, 3, 10)).toEqual([['Svenska sidor: index', ['700', '799']]]);
  });

  it('name-link: a note, an open list and a wrapped end after the last number (196, 197)', () => {
    expect(shape(196, 2, 19)).toMatchObject({ note: '(marras-huhtikuu)', open: false, rest: [] });
    expect(shape(197, 2, 21)).toMatchObject({ note: '(loka-', rest: [] });
    // `Ruokavihje 811            toukokuu)`: the end of 420's note, far right.
    expect(shape(197, 2, 22)).toMatchObject({
      note: '',
      rest: [{ column: 31, text: 'toukokuu)' }],
    });
    // `Fem, Yle Teema & Fem 305, 312, 317,` goes on in the row below.
    expect(shape(196, 2, 10)).toMatchObject({ open: true });
    expect(names(196, 2, 10)).toEqual([['Fem, Yle Teema & Fem', ['305', '312', '317']]]);
    expect(is(196, 2, 11)).toEqual({ kind: 'nav', rule: 'link-only' });
  });

  it('name-link: other row shapes are left to the other rules', () => {
    // A link first (link-title), words after the number (running text), no number.
    expect(shape(400, 1, 4)).toBeUndefined();
    expect(shape(202, 2, 8)).toBeUndefined();
    expect(shape(198, 3, 18)).toBeUndefined();
    expect(is(198, 3, 18)).toEqual({ kind: 'paragraph', rule: 'text' });
    // `Name   123` with a wide gap stays link-column.
    expect(nameLinkRow('Säähakemisto   400', [])).toBeUndefined();
  });

  it('name-link: needs 3 such rows on the subpage, so article rows stay text (417, 189, 190)', () => {
    // `Tarkempi paikka: Paikasta Hujansalo 100` has the shape, but alone.
    expect(shape(417, 8, 5)).toBeDefined();
    expect(is(417, 8, 5)).toEqual({ kind: 'paragraph', rule: 'text' });
    expect(is(189, 1, 23)).toEqual({ kind: 'paragraph', rule: 'text' });
    // Two on the English page: still text.
    expect(shape(190, 1, 6)).toBeDefined();
    expect(shape(190, 1, 15)).toBeDefined();
    expect(is(190, 1, 6)).toEqual({ kind: 'paragraph', rule: 'text' });
  });

  it('name-link: bottom bars of the index stay bars (196-198)', () => {
    expect(is(196, 1, 23)).toEqual({ kind: 'nav', rule: 'coloured-nav' });
    expect(is(197, 1, 23)).toEqual({ kind: 'nav', rule: 'coloured-nav' });
    expect(is(198, 3, 23)).toEqual({ kind: 'nav', rule: 'coloured-nav' });
  });

  it('coloured-title: `592 Puolustusvoimien ampumatiedotteet` joins the 400 list', () => {
    // Yle's row: the number 592 is on the line, on a cyan background.
    expect(row(400, 1, 23).text.trim()).toBe('592 Puolustusvoimien ampumatiedotteet');
    expect(is(400, 1, 23)).toEqual({ kind: 'headline', rule: 'coloured-title' });
    expect(labels(400, 1, 23)).toEqual([['592', 'Puolustusvoimien ampumatiedotteet', false]]);
  });

  it('coloured-title: bars with several links or the name first stay bars (100, 196)', () => {
    expect(is(100, 1, 18)).toEqual({ kind: 'nav', rule: 'coloured-nav' });
    expect(is(100, 2, 23)).toEqual({ kind: 'nav', rule: 'coloured-nav' });
    expect(is(196, 1, 23)).toEqual({ kind: 'nav', rule: 'coloured-nav' });
  });

  it('only 196-198 get name-link rows and only 400 a coloured-title row (every fixture)', () => {
    const hits = (rule: string) =>
      readdirSync(pagesDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => load(f.replace('.json', '')))
        .filter((p): p is Page => p !== undefined)
        .filter((p) => classify(p).some((sp) => sp.lines.some((l) => l.rule === rule)))
        .map((p) => p.number)
        .sort((a, b) => a - b);
    expect(hits('name-link')).toEqual([196, 197, 198]);
    expect(hits('coloured-title')).toEqual([400]);
  });
});

describe('classify: stock, fund and price tables (RP.9)', () => {
  const files = readdirSync(pagesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  /** `page/subpage/row` of every row decided by `rule`, over all fixtures. */
  function rowsBy(rule: string): string[] {
    const out: string[] = [];
    for (const file of files) {
      const p = load(file.replace('.json', ''));
      if (!p) continue;
      for (const sp of classify(p)) {
        for (const l of sp.lines)
          if (l.rule === rule) out.push(`${p.number}/${sp.number}/${l.number}`);
      }
    }
    return out;
  }

  it('blanks concealed cells: the title row of 184 and 187 has no stray `sn`', () => {
    for (const sp of [1, 8, 16]) {
      expect(is(184, sp, 2)).toEqual({ kind: 'title', rule: 'title-row' });
      expect(row(184, sp, 2).text.trim()).toBe('Osakerahastot O-Z');
    }
    expect(row(187, 1, 2).text.trim()).toBe('Vaihtoehtoiset ja kiinteistö-');
  });

  it('band-header: both column-label rows of the fund header are table rows, on every subpage (184)', () => {
    for (const sp of classified(184)) {
      const at = (r: number) => sp.lines.find((l) => l.number === r)!;
      expect([at(3).kind, at(3).rule], `184/${sp.number}`).toEqual(['table', 'band-header']);
      expect([at(4).kind, at(4).rule], `184/${sp.number}`).toEqual(['table', 'band-header']);
      // Columns as Yle set them, nothing moved.
      expect(at(3).text).toBe('               OSUUDEN    MUUTOS  MUUTOS');
      expect(at(4).text).toBe('                  ARVO PV %EDELL   %12KK');
      expect(at(3).title).toBeUndefined();
    }
  });

  it('band-header: a title at the left edge of the band goes to `title` (176, 187)', () => {
    // 176: the page title and the first row's labels share row 2.
    expect(is(176, 1, 2)).toEqual({ kind: 'table', rule: 'band-header' });
    expect(row(176, 1, 2).title).toBe('OMXH Large Cap');
    expect(row(176, 1, 2).text.trim()).toBe('AIKA VAIHTO/e MUUTOS%');
    // Row 3 is labels only: `OSTO` is not a second title.
    expect(is(176, 1, 3)).toEqual({ kind: 'table', rule: 'band-header' });
    expect(row(176, 1, 3).title).toBeUndefined();
    expect(row(176, 1, 3).text.trim()).toBe('OSTO  MYYNTI    ALIN     YLIN    VIIM');
    // 187: the title wraps from row 2 into the labels row.
    expect(row(187, 1, 3).title).toBe('rahastot');
    expect(row(187, 1, 3).text.trim()).toBe('OSUUDEN    MUUTOS  MUUTOS');
  });

  it('band-header: titles, notes and dates above a table stay titles (174, 189, 301, 425)', () => {
    expect(is(174, 1, 3)).toEqual({ kind: 'title', rule: 'title-row' }); // `Lähde: FactSet ja OMX`
    expect(is(189, 1, 2)).toEqual({ kind: 'title', rule: 'title-row' }); // `Pörssisähkö   25.10. klo 23.10`
    expect(is(301, 1, 2)).toEqual({ kind: 'title', rule: 'title-row' }); // `TV1   Keskiviikko 21.10.`
    expect(is(425, 1, 2)).toEqual({ kind: 'title', rule: 'title-row' }); // `Lähtevät/Departures`
  });

  it('band-header: fires on the three stock and fund fixtures only, rows 2-4', () => {
    const hits = rowsBy('band-header');
    expect(new Set(hits.map((h) => h.split('/')[0]))).toEqual(new Set(['176', '184', '187']));
    expect(hits.every((h) => ['2', '3', '4'].includes(h.split('/')[2]))).toBe(true);
  });

  it('table-caption: the line over each price table is its heading (189, every subpage)', () => {
    const captions = [
      'Tänään klo 00-12 (hinta 15 min välein)',
      'Tänään klo 12-24 (hinta 15min välein)',
      'Huomenna klo 00-12 (hinta 15min välein)',
      'Huomenna klo 12-24 (hinta 15min välein)',
    ];
    captions.forEach((caption, i) => {
      expect(is(189, i + 1, 4)).toEqual({ kind: 'heading', rule: 'table-caption' });
      expect(row(189, i + 1, 4).text.trim()).toBe(caption);
      // `Hinta nyt …` above it stays a paragraph of its own.
      expect(is(189, i + 1, 3)).toEqual({ kind: 'paragraph', rule: 'text' });
    });
    expect(is(404, 1, 18)).toEqual({ kind: 'heading', rule: 'table-caption' });
  });

  it('table-caption: not over a table that only joined its neighbours, nor mid-sentence', () => {
    expect(is(101, 1, 11).rule).not.toBe('table-caption'); // contact line over a `table-neighbour`
    expect(is(419, 1, 10).rule).not.toBe('table-caption'); // `Säätila:` over a `table-neighbour`
    // The row above does not end a sentence: the row continues it.
    const p = structuredClone(load(189)!);
    const r3 = p.subpages[0].lines.find((l) => l.number === 3)!;
    r3.runs = r3.runs.map((r) => ({ ...r, text: r.text.replace('ALV:n)', 'ALV:n  ') }));
    const sp = classify(p)[0];
    expect(sp.lines.find((l) => l.number === 4)!.rule).not.toBe('table-caption');
  });

  it('table-caption: fires on 189 and 404 only', () => {
    expect(new Set(rowsBy('table-caption').map((h) => h.split('/')[0]))).toEqual(
      new Set(['189', '404']),
    );
  });
});

describe('classify: hasWord', () => {
  it.each([
    ['Etelässä odotetaan', true],
    ['Teksti-TV:n', true],
    ['S=etelä', true],
    ['liknande”', true],
    ['ppsssssssssssss3##', false],
    ['prss', false],
    ['0j}|ij', false],
    ['`~s+t', false],
    ['T A', false],
    ['#MeToo', true],
    ['$100 dollaria', true],
  ])('%s → %s', (text, expected) => {
    expect(hasWord(text)).toBe(expected);
  });
});

describe('classify: isBracketNote (table-note, 235)', () => {
  it.each([
    ['(Koivunen)', true],
    ['  (Aho, Laine)  ', true],
    ['Nugent-Hopkins24 (Aho)', true],
    ['(12-10)', false], // no letter in the note
    ['Koivunen (Aho)', false], // the token before the note has no digit
    ['24 (Aho) (Laine)', false], // two notes
    ['24 a (Aho)', false], // two tokens before the note
    ['(1 (Aho)', true], // the first token may hold a bracket
    ['(Aho', false],
  ])('%s → %s', (text, expected) => {
    expect(isBracketNote(text)).toBe(expected);
  });

  it('answers in linear time on 5,000-character rows (the old regex was cubic)', () => {
    const n = 5000;
    const t0 = performance.now();
    expect(isBracketNote('1'.repeat(n) + ' (' + 'a'.repeat(n))).toBe(false);
    expect(isBracketNote('1'.repeat(n) + ' (' + 'a'.repeat(n) + ')')).toBe(true);
    expect(isBracketNote('(' + 'a1 '.repeat(n))).toBe(false);
    expect(performance.now() - t0).toBeLessThan(500); // same budget as analyse.test.ts
  });
});

describe('classify: sweep over every fixture', () => {
  const files = readdirSync(pagesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const KINDS = new Set<LineKind>([
    'drop',
    'blank',
    'title',
    'headline',
    'heading',
    'nav',
    'table',
    'paragraph',
  ]);

  for (const file of files) {
    const p = load(file.replace('.json', ''));
    if (!p) continue; // 404 fixtures
    it(`${file}: every row classified, no decoration leaks into text`, () => {
      const subpages = classify(p);
      expect(subpages.map((s) => s.number)).toEqual(p.subpages.map((s) => s.number));
      for (const sp of subpages) {
        expect(sp.lines).toHaveLength(MAX_LINE);
        for (const l of sp.lines) {
          const where = `${p.number}/${sp.number} row ${l.number}`;
          expect(KINDS.has(l.kind), where).toBe(true);
          expect(l.rule, where).toBeTruthy();
          expect(l.text.length, where).toBe(l.line.text.length);
          expect(l.text.length, where).toBeGreaterThanOrEqual(LINE_WIDTH);
          expect(l.text, where).not.toContain('\x7f');
          // Every decoration cell is blank in `text`.
          for (const r of l.line.runs) {
            if (isDecorationRun(r)) {
              expect(l.text.slice(r.column, r.column + r.text.length).trim(), where).toBe('');
            }
          }
          // No link starts on a graphics run.
          for (const link of l.links) {
            const run = l.line.runs.find((r) => r.column === link.column);
            expect(run && !isDecorationRun(run), where).toBe(true);
          }
          // Dropping real text is worse than showing junk: only row 1 and the
          // `Turku   >>>` arrows on 425 may.
          if (l.kind === 'drop' && l.rule !== 'header-row' && l.rule !== 'board-arrow') {
            expect(hasWord(l.text), `${where}: ${l.text}`).toBe(false);
          }
          if (l.kind === 'paragraph' || l.kind === 'headline' || l.kind === 'heading') {
            expect(l.text.trim(), where).not.toBe('');
          }
        }
      }
    });
  }

  it('drops "name >>>" rows (board-arrow) only on the airport board 425', () => {
    const hits = files.filter((file) => {
      const p = load(file.replace('.json', ''));
      return (
        p !== undefined && classify(p).some((sp) => sp.lines.some((l) => l.rule === 'board-arrow'))
      );
    });
    expect(hits).toEqual(['425.json']);
  });
});
