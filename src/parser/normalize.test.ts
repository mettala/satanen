import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { LINE_WIDTH, MAX_LINE, type Line, type Page, type Run } from './model';
import { normalize } from './normalize';

const here = fileURLToPath(new URL('.', import.meta.url));
const pagesDir = resolve(here, '../../fixtures/pages');
const fixtureFiles = readdirSync(pagesDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

function raw(n: number | string): any {
  return JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8'));
}

function load(n: number): Page {
  const result = normalize(raw(n));
  if (!result.ok) throw new Error(`fixture ${n}: ${result.error.message}`);
  return result.page;
}

function line(page: Page, subpage: number, row: number): Line {
  const sp = page.subpages.find((s) => s.number === subpage);
  const l = sp?.lines.find((x) => x.number === row);
  if (!l) throw new Error(`no line ${subpage}/${row} on page ${page.number}`);
  return l;
}

function allRuns(page: Page): Run[] {
  return page.subpages.flatMap((s) => s.lines.flatMap((l) => l.runs));
}

const asArray = (x: any): any[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

describe('normalize: every fixture', () => {
  it('finds the fixtures', () => {
    expect(fixtureFiles.length).toBeGreaterThan(40);
  });

  for (const file of fixtureFiles) {
    const input = JSON.parse(readFileSync(resolve(pagesDir, file), 'utf8'));
    const pageNo = Number(file.replace('.json', ''));

    if (input._fixture === 'not-found') {
      it(`${file}: 404 fixture gives an error result, not a throw`, () => {
        const result = normalize(input);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('not-a-page');
      });
      continue;
    }

    it(`${file}: normalises with sane invariants`, () => {
      const result = normalize(input);
      expect(result.ok, JSON.stringify(!result.ok && result.error)).toBe(true);
      if (!result.ok) return;
      const page = result.page;
      const rawPage = input.teletext.page;

      expect(page.number).toBe(pageNo);
      expect(page.warnings).toEqual([]);
      expect(typeof page.name).toBe('string');

      // Subpage count matches what Yle declared and what was sent.
      expect(page.subpageCount).toBe(Number(rawPage.subpagecount));
      expect(page.subpages).toHaveLength(page.subpageCount);
      expect(page.subpages.map((s) => s.number)).toEqual(
        Array.from({ length: page.subpageCount }, (_, i) => i + 1),
      );

      const rawSubpages = asArray(rawPage.subpage);
      page.subpages.forEach((sp, si) => {
        // Yle sends all 24 rows, numbered 1..24.
        expect(sp.lines.map((l) => l.number)).toEqual(
          Array.from({ length: MAX_LINE }, (_, i) => i + 1),
        );
        const rawLines = asArray(
          asArray(rawSubpages[si].content).find((c: any) => c.type === 'structured').line,
        );

        sp.lines.forEach((l, li) => {
          expect(l.runs.length).toBeGreaterThan(0);
          // Columns are contiguous and every row is exactly 40 cells.
          let col = 0;
          for (const r of l.runs) {
            expect(r.column).toBe(col);
            expect(r.length).toBeGreaterThan(0);
            expect(r.text).toHaveLength(r.length);
            if (!r.hasText) expect(r.text.trim()).toBe('');
            // Graphics runs are Yle's `g` runs (with `charcode`), or pieces of a
            // plain run that the `all` content shows in graphics mode (RP.8).
            expect(r.graphics).toBe(r.charcode !== undefined || r.graphicsFromAll === true);
            if (r.graphicsFromAll) expect(r.charcode).toBeUndefined();
            col += r.length;
          }
          expect(col).toBe(LINE_WIDTH);
          expect(l.text).toBe(l.runs.map((r) => r.text).join(''));

          // Text is exactly what Yle sent (no trimming or collapsing). A raw run
          // may be split into several runs (RP.8); joined, they are the raw run.
          const rawRuns = asArray(rawLines[li].run);
          let at = 0;
          const rebuilt = rawRuns.map((raw: any) => {
            const start = at;
            at += Number(raw.length);
            const pieces = l.runs.filter((r) => r.column >= start && r.column < at);
            return pieces[0].hasText ? pieces.map((r) => r.text).join('') : undefined;
          });
          expect(rebuilt).toEqual(rawRuns.map((r: any) => r.Text));
        });
      });

      // Link runs always have a usable target.
      for (const r of allRuns(page).filter((x) => x.link)) {
        const link = r.link!;
        if (link.kind === 'page') {
          expect(link.page).toBeGreaterThanOrEqual(100);
          expect(link.page).toBeLessThanOrEqual(899);
        } else if (link.kind === 'url') {
          expect(link.href).toMatch(/^(https?|mailto):\S+$/);
        } else {
          expect(link.raw.length).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe('normalize: quirks', () => {
  it('turns string numbers into numbers', () => {
    const page = load(103);
    expect(page.number).toBe(103);
    expect(page.prevPage).toBe(102);
    expect(page.nextPage).toBe(104);
    expect(page.subpageCount).toBe(1);
    expect(page.subpages[0].displaySeconds).toBe(15);
    expect(line(page, 1, 6).runs[0].length).toBe(40);
  });

  it('also accepts real numbers where Yle sends strings', () => {
    const input = raw(103);
    const p = input.teletext.page;
    p.number = 103;
    p.subpagecount = 1;
    p.prevpg = 102;
    p.subpage[0].number = 1;
    for (const l of p.subpage[0].content[2].line) {
      l.number = Number(l.number);
      for (const r of asArray(l.run)) r.length = Number(r.length);
    }
    expect(normalize(input)).toEqual(normalize(raw(103)));
  });

  it('treats a single run object like a one-item array (103 line 2)', () => {
    expect(Array.isArray(raw(103).teletext.page.subpage[0].content[2].line[1].run)).toBe(false);
    const l = line(load(103), 1, 2);
    expect(l.runs).toHaveLength(1);
    expect(l.runs[0]).toMatchObject({ column: 0, length: 40, hasText: false });
    expect(l.text).toBe(' '.repeat(40));
  });

  it('treats single subpage, content and line objects like arrays', () => {
    // Not seen in the fixtures (they always send arrays here) but documented by Yle.
    const input = raw(103);
    const p = input.teletext.page;
    p.subpage = p.subpage[0];
    const structured = p.subpage.content[2];
    p.subpage.content = structured;
    structured.line = structured.line[5];
    const result = normalize(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.page.subpageCount).toBe(1);
    expect(result.page.subpages[0].lines).toHaveLength(1);
    expect(result.page.subpages[0].lines[0].text).toBe(' Keskiviikkona aamulla liikenteessä     ');
  });

  it('keeps an empty page name as "" (most pages, e.g. 103)', () => {
    expect(load(103).name).toBe('');
    expect(load(100).name).toBe('Uutiset');
  });

  it('handles the front page: no prevpg, animated, 8-second subpages (100)', () => {
    const page = load(100);
    expect(page.prevPage).toBeUndefined();
    expect(page.nextPage).toBe(101);
    expect(page.animated).toBe(true);
    expect(page.topType).toBe('block');
    expect(page.subpages.map((s) => s.displaySeconds)).toEqual([8, 8, 8, 8]);
    expect(load(103).animated).toBe(false);
  });

  it('keeps both timestamps (103)', () => {
    const page = load(103);
    expect(page.time).toBe('2026-10-21T05:26:37');
    expect(page.updatedAt).toBe('2026-10-21T02:26:37Z');
  });

  it('reads a multi-subpage article in order (725)', () => {
    const page = load(725);
    expect(page.subpageCount).toBe(3);
    expect(page.subpages.map((s) => s.number)).toEqual([1, 2, 3]);
    const bodies = page.subpages.map((s) => s.lines.map((l) => l.text).join('\n'));
    expect(new Set(bodies).size).toBe(3);
    expect(bodies[0]).toContain('Gammelstadsforsen');
  });

  it('handles the 44-subpage stress case (417)', () => {
    const page = load(417);
    expect(page.subpageCount).toBe(44);
    expect(page.subpages.at(-1)?.number).toBe(44);
    expect(page.subpages.every((s) => s.lines.length === 24)).toBe(true);
  });

  it('keeps leading spaces and column positions (103 line 3 and 6)', () => {
    const page = load(103);
    // The left spacer is sometimes a 2-cell blank run...
    const headline = line(page, 1, 3);
    expect(headline.runs[0]).toMatchObject({ column: 0, length: 2, hasText: false });
    expect(headline.runs[1].column).toBe(2);
    // ...and sometimes part of a 40-cell text run that starts with a space.
    const body = line(page, 1, 6);
    expect(body.runs).toHaveLength(1);
    expect(body.text).toBe(' Keskiviikkona aamulla liikenteessä     ');
  });
});

describe('normalize: links', () => {
  it('reads page-number links (100 line 6)', () => {
    const run = line(load(100), 1, 6).runs[1];
    expect(run).toMatchObject({ text: '136', column: 1, link: { kind: 'page', page: 136 } });
  });

  it('keeps a range like 406-408 as two link runs around a plain "-" (100)', () => {
    const l = line(load(100), 1, 22);
    expect(l.text).toContain('406-408');
    const i = l.runs.findIndex((r) => r.text === '406');
    expect(l.runs.slice(i, i + 3).map((r) => [r.text, r.link])).toEqual([
      ['406', { kind: 'page', page: 406 }],
      ['-', undefined],
      ['408', { kind: 'page', page: 408 }],
    ]);
  });

  it('keeps a spaced range like "196 - 198" (101 line 23)', () => {
    const l = line(load(101), 1, 23);
    const i = l.runs.findIndex((r) => r.text === '196');
    expect(l.runs.slice(i, i + 3).map((r) => [r.text, r.link?.kind])).toEqual([
      ['196', 'page'],
      [' - ', undefined],
      ['198', 'page'],
    ]);
  });

  it('reads web links whose text omits the scheme (100 line 4)', () => {
    const run = line(load(100), 1, 4).runs.find((r) => r.link?.kind === 'url');
    expect(run?.text).toBe('yle.fi/tekstitv');
    expect(run?.link).toEqual({ kind: 'url', href: 'https://yle.fi/tekstitv' });
  });

  it('reads mailto links (101 line 12)', () => {
    const run = line(load(101), 1, 12).runs.find((r) => r.link);
    expect(run?.text).toBe('yle.uutiset@yle.fi');
    expect(run?.link).toEqual({ kind: 'url', href: 'mailto:yle.uutiset@yle.fi' });
  });

  it('keeps unknown link values as "other" (199 ">>>")', () => {
    const run = line(load(199), 2, 23).runs.find((r) => r.text === '>>>');
    expect(run?.link).toEqual({ kind: 'other', raw: '>>>' });
  });

  it('keeps links Yle found inside mosaic graphics, one digit per run (890 line 2)', () => {
    const runs = line(load(890), 1, 2).runs.filter(
      (r) => r.link?.kind === 'page' && r.link.page === 757,
    );
    expect(runs.map((r) => r.text).join('')).toBe('757');
    expect(runs.every((r) => r.graphics)).toBe(true);
  });
});

describe('normalize: double height and graphics', () => {
  it('marks double-height headline runs and their text-less companion row (103)', () => {
    const page = load(103);
    const title = line(page, 1, 3).runs[1];
    expect(title).toMatchObject({ doubleHeight: true, hasText: true, fg: 'yellow' });
    expect(title.text).toBe('Etelässä odotetaan lämpenemistä       ');
    const companion = line(page, 1, 4).runs[1];
    expect(companion).toMatchObject({ doubleHeight: true, hasText: false, length: 38 });
    expect(companion.text).toBe(' '.repeat(38));
  });

  it('keeps the link on the companion row of a double-height headline (100 line 7)', () => {
    const run = line(load(100), 1, 7).runs[1];
    expect(run).toMatchObject({ doubleHeight: true, hasText: false });
    expect(run.link).toEqual({ kind: 'page', page: 136 });
  });

  it('splits the g prefix off graphics colours (100 line 5)', () => {
    const run = line(load(100), 1, 5).runs[1];
    expect(run).toMatchObject({ fg: 'blue', graphics: true, charcode: '23h', length: 39 });
    expect(run.text).toBe('#'.repeat(39));
  });

  it('does not mistake plain "green" for graphics (199 line 5)', () => {
    const run = line(load(199), 1, 5).runs.find((r) => r.text === '100');
    expect(run).toMatchObject({ fg: 'green', graphics: false, link: { kind: 'page', page: 100 } });
  });

  it('keeps DEL (0x7F) mosaic cells verbatim (330 line 3)', () => {
    const runs = line(load(330), 1, 3).runs.filter((r) => r.charcode === '7Fh');
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((r) => r.graphics && /^\x7f+$/.test(r.text))).toBe(true);
  });

  it('keeps DEL inside decorative art sent as plain text (420 line 3, 890 line 6)', () => {
    // On 420 the DEL cells are in graphics mode in Yle's `all` content, so they
    // become graphics runs; the text is kept verbatim either way.
    const runs = line(load(420), 1, 3).runs.filter((r) => r.text.includes('\x7f'));
    expect(runs.map((r) => [r.text, r.graphics, r.graphicsFromAll])).toEqual([
      ['x\x7f', true, true],
    ]);
    // 890 line 6: the mosaic after `{SG}` arrives as a plain yellow run.
    const yellow = line(load(890), 1, 6).runs.filter((r) => r.text.includes('\x7f') && !r.charcode);
    expect(yellow.map((r) => [r.text, r.fg, r.graphics, r.graphicsFromAll])).toEqual([
      ['"o\x7f~\'', 'yellow', true, true],
    ]);
  });
});

describe('normalize: graphics cells sent as plain text (RP.8, quirk 28)', () => {
  /** `[text, graphics, graphicsFromAll]` of every run on a row with text in it. */
  const shape = (l: Line) =>
    l.runs
      .filter((r) => r.text.trim() !== '')
      .map((r) => [r.text, r.graphics, r.graphicsFromAll === true]);

  it('splits the sun picture off `AURINKO   NOUSEE LASKEE` (891 row 9)', () => {
    const l = line(load(891), 1, 9);
    expect(shape(l)).toEqual([
      ['+ bs,bupuu ', true, true],
      ['AURINKO   NOUSEE LASKEE   ', false, false],
    ]);
    // Both pieces keep the raw run's colour and their own columns.
    expect(l.runs.slice(-2).map((r) => [r.fg, r.column, r.length])).toEqual([
      ['yellow', 3, 11],
      ['yellow', 14, 26],
    ]);
    expect(l.text).toBe('   + bs,bupuu AURINKO   NOUSEE LASKEE   ');
  });

  it('marks the big date and the picture next to the header lines as graphics (891 rows 5-7)', () => {
    const page = load(891);
    expect(shape(line(page, 1, 5)).every(([, graphics]) => graphics)).toBe(true);
    expect(shape(line(page, 1, 6))).toEqual([
      ['  h 5wp\x7f#,\x7f! ', true, true],
      ['ON SUNNUNTAI 25.10.2026   ', false, false],
    ]);
    expect(shape(line(page, 1, 7))).toEqual([
      ['  07 bz  uj4 ', true, true],
      ['KESÄAIKA PÄÄTTYY          ', false, false],
    ]);
  });

  it('leaves blast-through text alone: `TORSTAI` on 130 and 160 row 2', () => {
    for (const n of [130, 160]) {
      const l = line(load(n), 1, 2);
      expect(l.runs.some((r) => r.graphicsFromAll)).toBe(false);
      expect(l.runs.some((r) => !r.graphics && r.text.includes('TORSTAI'))).toBe(true);
    }
  });

  it('keeps every run as `structured` sent it when `all` is missing or does not match', () => {
    const noAll = raw(891);
    noAll.teletext.page.subpage[0].content = noAll.teletext.page.subpage[0].content.filter(
      (c: any) => c.type !== 'all',
    );
    const mismatch = raw(891);
    const all = mismatch.teletext.page.subpage[0].content.find((c: any) => c.type === 'all');
    all.line[8].Text = all.line[8].Text.replace('AURINKO', 'AURINK0');
    for (const input of [noAll, mismatch]) {
      const result = normalize(input);
      if (!result.ok) throw new Error('891 does not normalise');
      const l = line(result.page, 1, 9);
      expect(shape(l)).toEqual([['+ bs,bupuu AURINKO   NOUSEE LASKEE   ', false, false]]);
      expect(result.page.warnings).toEqual([]);
    }
  });

  it('keeps a link on every piece of a split run', () => {
    const input = raw(891);
    const runs = input.teletext.page.subpage[0].content.find((c: any) => c.type === 'structured')
      .line[8].run;
    runs[runs.length - 1].link = '400';
    const result = normalize(input);
    if (!result.ok) throw new Error('891 does not normalise');
    const pieces = line(result.page, 1, 9).runs.slice(-2);
    expect(pieces.map((r) => r.link)).toEqual([
      { kind: 'page', page: 400 },
      { kind: 'page', page: 400 },
    ]);
  });

  it('finds such cells on exactly these fixture rows (a change here changes what readers see)', () => {
    const found: string[] = [];
    for (const file of fixtureFiles) {
      const result = normalize(raw(file.replace('.json', '')));
      if (!result.ok) continue;
      for (const sp of result.page.subpages) {
        const rows = sp.lines.filter((l) => l.runs.some((r) => r.graphicsFromAll));
        if (rows.length > 0) {
          found.push(`${result.page.number}/${sp.number}: ${rows.map((l) => l.number).join(' ')}`);
        }
      }
    }
    expect(found).toEqual([
      '420/1: 3 5 6 7 18 19 20 21 22 23',
      '700/1: 1 2 3',
      '799/1: 1 2 3',
      '890/1: 4 5 6',
      '891/1: 2 3 4 5 6 7 8 9 10 11 12 13 14',
    ]);
  });
});

describe('normalize: concealed cells (RP.9, quirk 29)', () => {
  it('marks the hidden `sn` on the fund pages as concealed and keeps its text and column (184, 187 row 2)', () => {
    for (const [n, column] of [
      [184, 36],
      [187, 37],
    ]) {
      const runs = line(load(n), 1, 2).runs.filter((r) => r.concealed);
      expect(
        runs.map((r) => [r.text.trim(), r.column]),
        String(n),
      ).toEqual([['sn', column]]);
      expect(runs[0].graphics).toBe(false);
    }
  });

  it('is only set where Yle sent `conceal: "true"`: two pages, row 2, every subpage', () => {
    const hits: string[] = [];
    for (const f of fixtureFiles) {
      const r = normalize(raw(f.replace('.json', '')));
      if (!r.ok) continue;
      for (const sp of r.page.subpages) {
        for (const l of sp.lines) {
          if (l.runs.some((x) => x.concealed))
            hits.push(`${r.page.number}/${sp.number}/${l.number}`);
        }
      }
    }
    expect(new Set(hits.map((h) => h.split('/')[0]))).toEqual(new Set(['184', '187']));
    expect(hits.every((h) => h.endsWith('/2'))).toBe(true);
    expect(hits).toHaveLength(16 + 8);
  });

  it('ignores any other conceal value', () => {
    const page = structuredClone(raw(184));
    const sp = page.teletext.page.subpage[0];
    const structured = sp.content.find((c: { type: string }) => c.type === 'structured');
    const run = asArray(structured.line[1].run).find((r: { conceal?: string }) => r.conceal);
    run.conceal = 'false';
    const r = normalize(page);
    if (!r.ok) throw new Error('184 does not normalise');
    expect(line(r.page, 1, 2).runs.some((x) => x.concealed)).toBe(false);
  });
});

describe('normalize: unusable input', () => {
  it.each([
    ['null', null],
    ['a string', 'hello'],
    ['an array', []],
    ['an empty object', {}],
    ['teletext without page', { teletext: {} }],
    ['page without number', { teletext: { page: { name: 'x' } } }],
  ])('returns not-a-page for %s', (_label, input) => {
    const result = normalize(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-a-page');
  });

  it('returns no-content for a page without subpages', () => {
    const result = normalize({ teletext: { page: { number: '100', subpagecount: '0' } } });
    expect(result).toMatchObject({ ok: false, error: { kind: 'no-content' } });
  });

  it('returns no-content when no subpage has structured content', () => {
    const input = raw(103);
    input.teletext.page.subpage[0].content = input.teletext.page.subpage[0].content.slice(0, 2);
    expect(normalize(input)).toMatchObject({ ok: false, error: { kind: 'no-content' } });
  });

  it('does not throw on odd values deep inside a page, and warns instead', () => {
    const input = raw(103);
    const lines = input.teletext.page.subpage[0].content[2].line;
    lines[0].run[0].fg = 'purple';
    lines[1] = 'not a line';
    lines[2].number = '99';
    lines[5].run = [null, { bg: 'black', fg: 'white' }];
    const result = normalize(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.page.subpages[0].lines).toHaveLength(22);
    expect(result.page.subpages[0].lines[0].runs[0].fg).toBe('white');
    expect(result.page.warnings).toHaveLength(5);
  });
});

describe('normalize: Text and length disagree (none of the fixtures do this)', () => {
  // 103 line 6 is one 40-char run; split it so the second run's column matters.
  function withLine6(runs: unknown[]): Page {
    const input = raw(103);
    input.teletext.page.subpage[0].content[2].line[5].run = runs;
    const result = normalize(input);
    if (!result.ok) throw new Error(result.error.message);
    return result.page;
  }

  it('pads a too-short Text with spaces so the next run keeps its column', () => {
    const page = withLine6([
      { bg: 'black', fg: 'white', length: '10', Text: 'Keski' },
      { bg: 'black', fg: 'white', length: '30', Text: 'viikkona' },
    ]);
    const l = line(page, 1, 6);
    expect(l.runs[0].text).toBe('Keski     ');
    expect(l.runs[1].column).toBe(10);
    expect(l.text.indexOf('viikkona')).toBe(10);
    expect(page.warnings).toEqual([
      'sp1 L6 run1: Text is 5 chars but length is 10',
      'sp1 L6 run2: Text is 8 chars but length is 30',
    ]);
  });

  it('keeps a too-long Text whole within the row and still places the next run by length', () => {
    const page = withLine6([
      { bg: 'black', fg: 'white', length: '3', Text: 'Keskiviikkona' },
      { bg: 'black', fg: 'white', length: '27', Text: 'x'.repeat(27) },
    ]);
    const l = line(page, 1, 6);
    expect(l.runs[0].text).toBe('Keskiviikkona');
    expect(l.runs[1].column).toBe(3);
    expect(l.text).toBe('Keskiviikkona' + 'x'.repeat(27));
    expect(l.overflow).toBeUndefined();
    expect(page.warnings).toEqual(['sp1 L6 run1: Text is 13 chars but length is 3']);
  });

  it('cuts a row at 40 columns and keeps the cut text in overflow and the warnings', () => {
    const page = withLine6([
      { bg: 'black', fg: 'white', length: '3', Text: 'Keskiviikkona' },
      { bg: 'black', fg: 'white', length: '37', Text: 'x'.repeat(30) + 'loppu  ' },
    ]);
    const l = line(page, 1, 6);
    expect(l.text).toBe('Keskiviikkona' + 'x'.repeat(27));
    expect(l.runs[1].text).toBe('x'.repeat(27));
    expect(l.overflow).toBe('xxxloppu  ');
    expect(page.warnings).toEqual([
      'sp1 L6 run1: Text is 13 chars but length is 3',
      'sp1 L6: row is longer than 40 columns, cut "xxxloppu  "',
    ]);
  });

  it('cuts a single 5,000-character run to the row width', () => {
    const text = 'a'.repeat(5000);
    const page = withLine6([{ bg: 'black', fg: 'white', length: '5000', Text: text }]);
    const l = line(page, 1, 6);
    expect(l.text).toBe(text.slice(0, LINE_WIDTH));
    expect(l.runs[0]).toMatchObject({ column: 0, length: LINE_WIDTH });
    expect(l.overflow).toBe(text.slice(LINE_WIDTH));
    expect(page.warnings[0]).toBe('sp1 L6 run1: length 5000 reaches past column 40, cut to 40');
  });

  it('clamps a huge length to the cells left on the row, never throws', () => {
    for (const length of ['50000000', 50000000, 1e10, '99999999999999999999']) {
      const page = withLine6([
        { bg: 'black', fg: 'white', length: '10', Text: 'Keskiviikk' },
        { bg: 'black', fg: 'white', length },
      ]);
      const l = line(page, 1, 6);
      expect(l.text).toBe('Keskiviikk' + ' '.repeat(30));
      expect(l.runs[1]).toMatchObject({ column: 10, length: 30, hasText: false });
      // Blank cells hold no content, so nothing counts as cut.
      expect(l.overflow).toBeUndefined();
      expect(page.warnings).toHaveLength(1);
      expect(page.warnings[0]).toMatch(
        /^sp1 L6 run2: length \d+ reaches past column 40, cut to 30$/,
      );
    }
  });

  it('treats a negative length with Text as missing: uses the Text length, page still loads', () => {
    const page = withLine6([
      { bg: 'black', fg: 'white', length: -5, Text: 'Keskiviikk' },
      { bg: 'black', fg: 'white', length: '30', Text: 'z'.repeat(30) },
    ]);
    const l = line(page, 1, 6);
    expect(l.runs.map((r) => [r.column, r.length])).toEqual([
      [0, 10],
      [10, 30],
    ]);
    expect(l.text).toBe('Keskiviikk' + 'z'.repeat(30));
    expect(page.warnings).toEqual([
      'sp1 L6 run1: run has a bad length (not a whole number ≥ 0), used Text length',
    ]);
  });

  it('skips a run with a negative length and no Text, with a warning: no throw, page still loads', () => {
    const page = withLine6([
      { bg: 'black', fg: 'white', length: -5 },
      { bg: 'black', fg: 'white', length: '40', Text: 'y'.repeat(40) },
    ]);
    const l = line(page, 1, 6);
    expect(l.runs).toHaveLength(1);
    expect(l.runs[0]).toMatchObject({ column: 0, length: 40 });
    expect(l.text).toBe('y'.repeat(40));
    expect(page.warnings).toEqual([
      'sp1 L6 run1: run has a bad length (not a whole number ≥ 0) and no Text, skipped',
    ]);
  });

  it('treats NaN, Infinity, fractions and negative strings as a bad length', () => {
    for (const length of [Number.NaN, Number.POSITIVE_INFINITY, 2.5, '-5', '2.5', 'abc']) {
      const page = withLine6([
        { bg: 'black', fg: 'white', length },
        { bg: 'black', fg: 'white', length: '40', Text: 'y'.repeat(40) },
      ]);
      const l = line(page, 1, 6);
      expect(l.text, String(length)).toBe('y'.repeat(40));
      expect(l.runs.every((r) => r.column >= 0 && r.length >= 0)).toBe(true);
      expect(page.warnings).toHaveLength(1);
    }
  });

  it('ignores negative numbers elsewhere too: subpage number, display time, prev/next page', () => {
    const input = raw(103);
    input.teletext.page.prevpg = -1;
    input.teletext.page.nextpg = -104;
    input.teletext.page.subpage[0].number = -3;
    input.teletext.page.subpage[0].time = -10;
    const result = normalize(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.page.prevPage).toBeUndefined();
    expect(result.page.nextPage).toBeUndefined();
    expect(result.page.subpages[0].number).toBe(1);
    expect(result.page.subpages[0].displaySeconds).toBeUndefined();
    expect(result.page.warnings).toEqual(['subpage 1: no number, used position']);
  });

  it('rejects a negative page number as not a page, without throwing', () => {
    const input = raw(103);
    input.teletext.page.number = -103;
    expect(normalize(input)).toMatchObject({ ok: false, error: { kind: 'not-a-page' } });
  });

  it('skips a run that starts past column 40 and keeps its text in overflow', () => {
    const page = withLine6([
      { bg: 'black', fg: 'white', length: '40', Text: 'y'.repeat(40) },
      { bg: 'black', fg: 'white', length: '5', Text: 'extra', link: '105' },
    ]);
    const l = line(page, 1, 6);
    expect(l.runs).toHaveLength(1);
    expect(l.text).toBe('y'.repeat(40));
    expect(l.overflow).toBe('extra');
    expect(page.warnings).toEqual([
      'sp1 L6 run2: length 5 reaches past column 40, cut to 0',
      'sp1 L6 run2: Text is 5 chars but length is 0',
      'sp1 L6 run2: starts past column 40, skipped',
      'sp1 L6: row is longer than 40 columns, cut "extra"',
    ]);
  });

  it('cuts spaces past column 40 with a warning but no overflow', () => {
    const page = withLine6([
      { bg: 'black', fg: 'white', length: '40', Text: 'Keskiviikkona aamulla' + ' '.repeat(25) },
    ]);
    const l = line(page, 1, 6);
    expect(l.text).toBe('Keskiviikkona aamulla' + ' '.repeat(19));
    expect(l.overflow).toBeUndefined();
    expect(page.warnings).toEqual([
      'sp1 L6 run1: Text is 46 chars but length is 40',
      'sp1 L6: row is longer than 40 columns, cut "      "',
    ]);
  });

  it('keeps a run with odd fields but a known length, so columns do not shift', () => {
    const page = withLine6([
      { bg: 'plaid', fg: 'purple', size: 'huge', length: '4' },
      { bg: 'black', fg: 'white', length: '36', Text: 'y'.repeat(36) },
    ]);
    const l = line(page, 1, 6);
    expect(l.runs[0]).toMatchObject({ text: '    ', hasText: false, column: 0, length: 4 });
    expect(l.runs[1].column).toBe(4);
    expect(page.warnings).toHaveLength(3);
  });

  it('treats "double size" as double height, with a warning', () => {
    const page = withLine6([
      { bg: 'black', fg: 'white', length: '40', Text: 'z'.repeat(40), size: 'double size' },
    ]);
    expect(line(page, 1, 6).runs[0].doubleHeight).toBe(true);
    expect(page.warnings).toEqual(['sp1 L6 run1: size "double size" treated as double height']);
  });
});

describe('normalize: neighbour page numbers (RP.10)', () => {
  // The bar above the tabs needs a previous and a next number on every page.
  // Yle gives numbers only (prevpg / nextpg), never titles. 100 has no
  // previous; 999 is not a news page and has neither.
  const ends = new Set([100, 999]);
  const readable = fixtureFiles
    .map((f) => Number(f.replace('.json', '')))
    .filter((n) => raw(n)._fixture === undefined);

  it('every saved page except the first and 999 has both neighbours', () => {
    for (const n of readable) {
      if (ends.has(n)) continue;
      const page = load(n);
      expect(page.prevPage, `prev of ${n}`).toBeTypeOf('number');
      expect(page.nextPage, `next of ${n}`).toBeTypeOf('number');
    }
  });

  it('page 100 has no previous page', () => {
    expect(load(100).prevPage).toBeUndefined();
    expect(load(100).nextPage).toBe(101);
  });
});
