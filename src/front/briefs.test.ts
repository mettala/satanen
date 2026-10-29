import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { classify } from '../parser/classify';
import { LINE_WIDTH, type Line, type Page } from '../parser/model';
import { normalize } from '../parser/normalize';
import {
  BRIEF_LABEL,
  briefPage,
  briefTitle,
  isBriefPage,
  splitLabel,
  subpageBriefs,
  titleCase,
} from './briefs';

const here = fileURLToPath(new URL('.', import.meta.url));
const pagesDir = resolve(here, '../../fixtures/pages');

function load(n: number): Page {
  const result = normalize(JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8')));
  if (!result.ok) throw new Error(`fixture ${n} does not normalise`);
  return result.page;
}

// ------------------------------------------------- hand-made page edits
// Edge cases are built from the real pages so the rows look like Yle's.

/** A plain white row with `text` from column 0 (Yle's rows start with a space). */
function plainLine(number: number, text: string): Line {
  const cells = text.padEnd(LINE_WIDTH).slice(0, LINE_WIDTH);
  const hasText = cells.trim() !== '';
  return {
    number,
    text: cells,
    runs: [
      {
        text: cells,
        hasText,
        column: 0,
        length: LINE_WIDTH,
        fg: 'white',
        bg: 'black',
        graphics: false,
        doubleHeight: false,
      },
    ],
  };
}

/** Replace row `row` of subpage index `sp` with plain text. */
function setRow(page: Page, sp: number, row: number, text: string): Page {
  const copy = structuredClone(page);
  const lines = copy.subpages[sp].lines;
  lines[lines.findIndex((l) => l.number === row)] = plainLine(row, text);
  return copy;
}

/** Remove rows from subpage index `sp`: the rows below move up, blank rows fill the bottom. */
function removeRows(page: Page, sp: number, rows: number[]): Page {
  const copy = structuredClone(page);
  const kept = copy.subpages[sp].lines.filter((l) => !rows.includes(l.number));
  while (kept.length < 24) kept.push(plainLine(0, ''));
  copy.subpages[sp].lines = kept.map((l, i) => ({ ...l, number: i + 1 }));
  return copy;
}

/** Keep only subpage index `sp`, as a one-subpage page. */
function onlySubpage(page: Page, sp: number): Page {
  const copy = structuredClone(page);
  copy.subpages = [{ ...copy.subpages[sp], number: 1 }];
  copy.subpageCount = 1;
  return copy;
}

const PESAPALLO =
  'Naisten Superpesiksen kaikkien aikojen lyöjäkuningatar Janette Lepistö jatkaa Lapuan ' +
  'Virkiässä ensi kaudella. Manse PP:n Virpi Hukka siirtyy MTV:n tietojen mukaan Porin ' +
  'Pesäkarhuihin.';
const AM_JALKAPALLO =
  'Suomi voitti Vantaalla Ison-Britannian 21-0 EM-lohkopelissään ja varmisti paikan vuonna ' +
  '2027 pelattaviin neljän maan mitalipeleihin.';
const JALKAPALLO =
  'Hyökkääjä David Ezeh on tehnyt kolmivuotisen sopimuksen Kuopion Palloseuran kanssa. Ezeh ' +
  'siirtyy Kuopioon kauden 2026 jälkeen. Ezeh, 20, on pelannut HJK:ssa 13-vuotiaasta. Hänen ' +
  'kautensa 2026 päättyi kesäkuussa lonkkamurtumaan ja leikkaukseen.';
const JAAKIEKKO =
  'SM-liigan HPK tiedotti tehneensä loppukauden sopimuksen 36-vuotiaan hyökkääjän Mattias ' +
  'Tedenbyn kanssa. Ruotsalaishyökkääjä on pelannut urallaan 120 NHL-ottelua ja 126 ' +
  'AHL-ottelua sekä voittanut kolme Ruotsin mestaruutta. Edelliset neljä kautta hän pelasi ' +
  'SHL:ssä HV71:ssä.';

const ALL_202 = [
  { label: 'PESÄPALLO', text: PESAPALLO },
  { label: 'AM.JALKAPALLO', text: AM_JALKAPALLO },
  { label: 'JALKAPALLO', text: JALKAPALLO },
  { label: 'JÄÄKIEKKO', text: JAAKIEKKO },
];

describe('BRIEF_LABEL / splitLabel', () => {
  it.each([
    ['PESÄPALLO: Naisten', 'PESÄPALLO', 'Naisten'],
    ['AM.JALKAPALLO: Suomi voitti', 'AM.JALKAPALLO', 'Suomi voitti'],
    ['F1: Hamilton', 'F1', 'Hamilton'],
    ['SM-LIIGA: Ilves', 'SM-LIIGA', 'Ilves'],
    ['YLEISURHEILU/MM: Tänään', 'YLEISURHEILU/MM', 'Tänään'],
    ['RAVIT & RAVIURHEILU: Tänään', 'RAVIT & RAVIURHEILU', 'Tänään'],
    ['  JÄÄKIEKKO:', 'JÄÄKIEKKO', ''],
    [' PESÄPALLO:  Naisten   Superpesiksen  ', 'PESÄPALLO', 'Naisten Superpesiksen'],
    ['AM  JALKAPALLO: Suomi', 'AM JALKAPALLO', 'Suomi'],
  ])('%s is a label', (row, label, rest) => {
    expect(splitLabel(row)).toEqual({ label, rest });
  });

  it.each([
    'Keskiviikon uutisia:', // lower case: an index page's lead-in
    'Tarkempi paikka: Topinoja', // a field (417)
    '12.30: Alkaa', // starts with a digit
    'A: yksi kirjain', // too short
    'PESÄPALLO:Naisten', // no space after the colon
    'NEWS HEADLINES 191-194', // no colon (190)
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ: liian pitkä', // 26 characters
  ])('%s is not a label', (row) => {
    expect(BRIEF_LABEL.test(row.trim())).toBe(false);
    expect(splitLabel(row)).toBeUndefined();
  });
});

describe('briefPage: 202 URHEILUSÄHKEET (2 subpages, 4 briefs)', () => {
  it('is a brief page', () => {
    expect(isBriefPage(load(202))).toBe(true);
  });

  it('reads all four briefs on both subpages, whole and unchanged', () => {
    expect(briefPage(load(202))).toEqual({ title: 'URHEILUSÄHKEET', briefs: ALL_202 });
  });

  it('subpage 1 has three briefs, subpage 2 one right below its title', () => {
    const [sp1, sp2] = classify(load(202));
    expect(subpageBriefs(sp1.lines).map((b) => b.label)).toEqual([
      'PESÄPALLO',
      'AM.JALKAPALLO',
      'JALKAPALLO',
    ]);
    expect(subpageBriefs(sp2.lines)).toEqual([{ label: 'JÄÄKIEKKO', text: JAAKIEKKO }]);
  });

  it('joins split words like the reader (36- + vuotiaan) and keeps game counts as text', () => {
    const text = briefPage(load(202))!.briefs[3].text;
    expect(text).toContain('36-vuotiaan');
    expect(text).toContain('urallaan 120 NHL-ottelua ja 126 AHL-ottelua sekä');
  });

  it('works without blank rows between briefs (a label row starts the next brief)', () => {
    // Rows 9 and 14 are the blank rows between subpage 1's briefs; row 3 the
    // blank row above subpage 2's brief. Without them row 13
    // `pelattaviin neljän maan mitalipeleihin.` fills its row, so the reader
    // would read `JALKAPALLO:` as a soft wrap; the label still starts a brief.
    const page = removeRows(removeRows(load(202), 0, [9, 14]), 1, [3]);
    const sp1 = classify(page)[0].lines.map((l) => l.text.trim());
    expect(sp1.slice(2, 4)).toEqual(['PESÄPALLO: Naisten Superpesiksen', expect.any(String)]);
    expect(sp1.slice(2, 19)).not.toContain('');
    expect(briefPage(page)).toEqual({ title: 'URHEILUSÄHKEET', briefs: ALL_202 });
  });

  it('a page with one brief', () => {
    expect(briefPage(onlySubpage(load(202), 1))).toEqual({
      title: 'URHEILUSÄHKEET',
      briefs: [{ label: 'JÄÄKIEKKO', text: JAAKIEKKO }],
    });
  });

  it('a page with no title row: briefs, no title', () => {
    const page = setRow(load(202), 0, 1, '');
    expect(briefPage(page)).toEqual({ briefs: ALL_202 });
  });

  it('a page whose title row is only a weekday: no title', () => {
    const page = setRow(load(202), 0, 1, '   LAUANTAI');
    expect(briefPage(page)?.title).toBeUndefined();
  });

  it('double spaces on the label row become one, like on the other rows', () => {
    // One double space only: a row with two wide gaps is a table row to the
    // classifier (`columns`), so it would not be read as text at all.
    const page = setRow(load(202), 0, 3, ' PESÄPALLO:  Naisten Superpesiksen');
    expect(briefPage(page)!.briefs[0]).toEqual({ label: 'PESÄPALLO', text: PESAPALLO });
  });

  it('a row without a label after a blank row belongs to no brief', () => {
    // Row 9 (blank between the first two briefs) gets a stray line of text.
    const page = setRow(load(202), 0, 9, ' Lisää myöhemmin.');
    const page2 = setRow(page, 0, 10, '');
    const briefs = briefPage(page2)!.briefs;
    // Row 9 now continues PESÄPALLO (no blank in between); row 10 is blank, so
    // the AM.JALKAPALLO rows 11-13 have no label and belong to no brief.
    expect(briefs.map((b) => b.label)).toEqual(['PESÄPALLO', 'JALKAPALLO', 'JÄÄKIEKKO']);
    expect(briefs[0].text).toBe(`${PESAPALLO} Lisää myöhemmin.`);
  });

  it('only the first body row decides: a heading first is an article', () => {
    // Row 3 (the first brief's label row) turned into a heading-like row
    // without a label: the briefs below don't make it a brief page.
    const page = setRow(load(202), 0, 3, ' Naisten Superpesiksen');
    expect(isBriefPage(page)).toBe(false);
    expect(briefPage(page)).toBeUndefined();
  });
});

describe('briefPage: pages that are not brief pages', () => {
  it.each([103, 104, 105, 109, 110, 136, 205])('article %i (starts with a heading)', (n) => {
    expect(briefPage(load(n))).toBeUndefined();
  });

  it('132: `WSJ:` in the heading is not a brief label', () => {
    expect(briefPage(load(132))).toBeUndefined();
  });

  it('799: the title row `PÅ SVENSKA:` is not a brief label', () => {
    expect(briefPage(load(799))).toBeUndefined();
  });

  it.each([230, 242, 203, 207])('table page %i', (n) => {
    expect(briefPage(load(n))).toBeUndefined();
  });

  it.each([100, 102, 190, 201])('index or digest page %i', (n) => {
    expect(briefPage(load(n))).toBeUndefined();
  });

  it('a label row inside an article does not make it a brief page', () => {
    // 105 with row 12 (start of its second paragraph) turned into a label row.
    const page = setRow(load(105), 0, 12, ' POLIISI: Ensihoito tarkasti paikan');
    expect(isBriefPage(page)).toBe(false);
    expect(briefPage(page)).toBeUndefined();
  });

  it('no fixture other than 202 is a brief page', () => {
    const found: number[] = [];
    for (const f of readdirSync(pagesDir)) {
      if (!f.endsWith('.json')) continue;
      const result = normalize(JSON.parse(readFileSync(resolve(pagesDir, f), 'utf8')));
      if (result.ok && briefPage(result.page)) found.push(result.page.number);
    }
    expect(found).toEqual([202]);
  });
});

describe('briefTitle', () => {
  it('drops the weekday from the header row', () => {
    expect(briefTitle(classify(load(202))[0])).toBe('URHEILUSÄHKEET');
  });

  it('is undefined with no subpage', () => {
    expect(briefTitle(undefined)).toBeUndefined();
  });
});

describe('titleCase', () => {
  it('changes only the case of an all-caps name', () => {
    expect(titleCase('URHEILUSÄHKEET')).toBe('Urheilusähkeet');
    expect(titleCase('ÄÄNESTYSSÄHKEET')).toBe('Äänestyssähkeet');
  });

  it('keeps words of 2-4 letters in capitals (abbreviations)', () => {
    expect(titleCase('NHL-JÄÄKIEKKO')).toBe('NHL-jääkiekko');
    expect(titleCase('SM-LIIGA')).toBe('SM-liiga');
    expect(titleCase('HJK')).toBe('HJK');
    expect(titleCase('JALKAPALLO SM')).toBe('Jalkapallo SM');
  });

  it('keeps a name with a digit as it is', () => {
    expect(titleCase('F1-SÄHKEET')).toBe('F1-SÄHKEET');
    expect(titleCase('JALKAPALLO T18 SM')).toBe('JALKAPALLO T18 SM');
  });

  it('keeps a name that already has lower-case letters', () => {
    expect(titleCase('Urheilusähkeet')).toBe('Urheilusähkeet');
    expect(titleCase('NHL-sähkeet')).toBe('NHL-sähkeet');
  });

  it('keeps every letter: only the case differs', () => {
    for (const name of ['URHEILUSÄHKEET', 'NHL-JÄÄKIEKKO', 'AM.JALKAPALLO / SM']) {
      expect(titleCase(name).toUpperCase()).toBe(name);
    }
  });
});
