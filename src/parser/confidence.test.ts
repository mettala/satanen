import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { classify, isDecorationRun, type ClassifiedSubpage } from './classify';
import {
  assessPage,
  assessSubpage,
  FALLBACK_BELOW,
  LOW_CONFIDENCE_BELOW,
  PER_ROW_CAP,
  type PageAssessment,
  type ReasonCode,
  type SubpageAssessment,
} from './confidence';
import { LINE_WIDTH, type Page } from './model';
import { normalize } from './normalize';

const here = fileURLToPath(new URL('.', import.meta.url));
const pagesDir = resolve(here, '../../fixtures/pages');

/**
 * Fixture page `n`. With `structuredOnly`, Yle's `all` content is left out, so
 * normalize cannot find mosaic cells sent as plain text (RP.8): the case the
 * `mosaic-leak` safety net is for.
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

const cache = new Map<string, ClassifiedSubpage[]>();
function classified(n: number, structuredOnly = false): ClassifiedSubpage[] {
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

/** A copy of a classified subpage with some rows' text replaced (padded to the row width). */
function withText(sp: ClassifiedSubpage, edits: Record<number, string>): ClassifiedSubpage {
  return {
    number: sp.number,
    lines: sp.lines.map((l) =>
      edits[l.number] === undefined ? l : { ...l, text: edits[l.number].padEnd(LINE_WIDTH) },
    ),
  };
}

function assess(n: number, structuredOnly = false): PageAssessment {
  return assessPage(classified(n, structuredOnly));
}

function sub(n: number, sp = 1, structuredOnly = false): SubpageAssessment {
  const s = assess(n, structuredOnly).subpages.find((x) => x.number === sp);
  if (!s) throw new Error(`no subpage ${sp} on ${n}`);
  return s;
}

/** Rows behind one signal on a subpage, or undefined when it did not fire. */
function rows(
  n: number,
  sp: number,
  reason: ReasonCode,
  structuredOnly = false,
): number[] | undefined {
  return sub(n, sp, structuredOnly).signals.find((s) => s.reason === reason)?.rows;
}

describe('confidence: graphics and readability', () => {
  it('flags a page that is mostly mosaic art as graphics-heavy and falls back (420)', () => {
    const a = sub(420);
    expect(a.reasons).toContain('graphics-heavy');
    expect(rows(420, 1, 'graphics-heavy')).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 19, 21, 22, 23,
    ]);
    expect(a.fallback).toBe(true);
  });

  it('flags few readable lines when under a third of the rows hold a word (420)', () => {
    // Only rows 13-17 and 20 (`Rinnesivuilla`, `421 Pohjois-Suomi`, …) read as text.
    expect(sub(420).reasons).toContain('few-readable-lines');
    expect(rows(420, 1, 'few-readable-lines')).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 19, 21, 22, 23,
    ]);
    // An index with a graphic logo still has plenty of readable rows.
    expect(sub(890).reasons).not.toContain('few-readable-lines');
  });

  it('does not count a graphic title band as graphics-heavy (410, 330: logo rows 2-7)', () => {
    expect(sub(410, 1).reasons).toEqual([]);
    expect(sub(330).reasons).toEqual([]);
  });

  it('marks a subpage with nothing on it as empty and falls back (103 with every row blanked)', () => {
    const [sp] = classified(103);
    const blanked: ClassifiedSubpage = {
      number: sp.number,
      lines: sp.lines.map((l) =>
        l.number === 1 ? l : { ...l, kind: 'blank', rule: 'blank', text: ' '.repeat(LINE_WIDTH) },
      ),
    };
    const a = assessSubpage(blanked);
    expect(a.reasons).toEqual(['empty']);
    expect(a.score).toBe(0);
    expect(a.fallback).toBe(true);
  });
});

describe('confidence: uncertain rules', () => {
  it('counts rows decided by UNCERTAIN_RULES (420: mosaic art sent as text, decoration-text)', () => {
    expect(sub(420).reasons).toContain('uncertain-rules');
    expect(rows(420, 1, 'uncertain-rules')).toContain(2);
  });

  it('does not count prose `text` rows: a plain article is fully trusted (103, 161, 725/3)', () => {
    for (const [n, sp] of [
      [103, 1],
      [161, 1],
      [725, 3],
    ]) {
      const a = sub(n, sp);
      expect(a.reasons, `${n}/${sp}`).toEqual([]);
      expect(a.score, `${n}/${sp}`).toBe(1);
    }
  });

  it('counts `text` rows only when they are set in columns (299 subpage 2: `Ruotsi   Evans`)', () => {
    expect(rows(299, 2, 'uncertain-rules')).toContain(5);
  });

  it('lets a table pulled together by table-neighbour stand (408/1: 10 of 21 rows)', () => {
    expect(sub(408, 1).reasons).toEqual([]);
  });
});

describe('confidence: garbage that would be shown', () => {
  it('flags mosaic codes left in a shown row and falls back (890 row 5: `KALENTERI   j}|ij`)', () => {
    // Without Yle's `all` content the mosaic after `{SG}` reads as text.
    expect(rows(890, 1, 'mosaic-leak', true)).toEqual([5]);
    expect(sub(890, 1, true).fallback).toBe(true);
    // With it (RP.8), normalize marks those cells as graphics: nothing leaks.
    expect(sub(890).reasons).toEqual([]);
    expect(sub(890).fallback).toBe(false);
  });

  it('does not take the TV guide `>352` page pointer for mosaic (301/1 rows 5-6)', () => {
    expect(sub(301, 1).reasons).not.toContain('mosaic-leak');
  });

  it('keeps an article in reader mode when it holds `>>`, `[1]` or `&gt;&gt;` (103 row 6 edited)', () => {
    for (const token of ['>>', '[1]', '&gt;&gt;', '<<<']) {
      const a = assessSubpage(
        withText(classified(103)[0], { 6: `Keskiviikkona ${token} aamulla` }),
      );
      expect(a.reasons, token).toEqual([]);
      expect(a.fallback, token).toBe(false);
    }
    // The same row with a real mosaic code does fall back.
    const bad = assessSubpage(withText(classified(103)[0], { 6: 'Keskiviikkona j}|ij aamulla' }));
    expect(bad.reasons).toEqual(['mosaic-leak']);
    expect(bad.fallback).toBe(true);
  });

  it('flags rulers like `-----` next to real text (500 rows 14 and 16)', () => {
    expect(rows(500, 1, 'symbol-run')).toEqual([14, 16]);
  });

  it('flags two-column text that reflowing would run together, and falls back (299 subpage 2)', () => {
    const a = sub(299, 2);
    expect(rows(299, 2, 'gapped-text')).toEqual([4, 5, 7, 8, 10, 11, 13, 14, 16, 17, 19, 20, 22]);
    expect(a.fallback).toBe(true);
  });

  it('ignores a few gapped rows on a normal page (190: 3 of 12 rows)', () => {
    expect(sub(190).reasons).not.toContain('gapped-text');
  });
});

describe('confidence: index pages', () => {
  it('flags text in a link row that belongs to no link (199 row 8 `hakemisto`, rows 19, 22)', () => {
    expect(rows(199, 1, 'nav-orphan-text')).toEqual([8, 19, 22]);
    expect(sub(199, 1).lowConfidence).toBe(true);
    expect(sub(199, 1).fallback).toBe(false);
  });

  it('does not count a page word between a name and its link as orphan text (242, 263, 425, 189)', () => {
    // `Otteluseuranta s. 241`: `s.` belongs to the link (rule page-ref).
    expect(rows(242, 4, 'nav-orphan-text')).toBeUndefined();
    expect(rows(263, 1, 'nav-orphan-text')).toBeUndefined();
    expect(rows(425, 1, 'nav-orphan-text')).toBeUndefined();
    expect(rows(189, 2, 'nav-orphan-text')).toBeUndefined();
  });

  it('trusts the alphabetical index: notes and wrapped ends of name-link rows are not orphans (196-198)', () => {
    // `Jalankulkusää 418 (marras-huhtikuu)`, `Ruokavihje 811     toukokuu)`.
    for (const n of [196, 197, 198]) {
      for (const s of assess(n).subpages) {
        expect(s.reasons, `${n}/${s.number}`).toEqual([]);
        expect(s.score, `${n}/${s.number}`).toBe(1);
      }
    }
  });

  it('flags continuation rows holding both columns (199/2 row 16: `ylihuomenna   Lisää ohjelmista`)', () => {
    expect(rows(199, 2, 'nav-orphan-text')).toContain(16);
  });

  it('accepts clean index rows and coloured bottom bars (199/3, 301/2 row 23, 100, 200)', () => {
    expect(sub(199, 3).reasons).toEqual([]);
    expect(sub(301, 2).reasons).toEqual([]);
    expect(assess(100).reasons).toEqual([]);
    expect(assess(200).reasons).toEqual([]);
  });

  it('caps per-row penalties so a busy index never falls back on them alone (199)', () => {
    expect(assess(199).fallback).toBe(false);
    for (const s of assess(199).subpages) expect(s.score).toBeGreaterThanOrEqual(0.7);
  });

  it('caps all per-row signals together, with a margin above fallback (500)', () => {
    expect(1 - PER_ROW_CAP).toBeGreaterThanOrEqual(FALLBACK_BELOW + 0.05);
    // 500 today: two rulers and one orphan row, capped to 0.35 in total.
    expect(sub(500).reasons).toEqual(['symbol-run', 'nav-orphan-text']);
    expect(sub(500).score).toBe(0.65);
    // A worse day: a ruler on every index row of 500 still only reaches the cap.
    const edits: Record<number, string> = {};
    for (let r = 4; r <= 12; r++) edits[r] = `${r + 497} Paikka  ----------`;
    const a = assessSubpage(withText(classified(500)[0], edits));
    expect(a.signals.find((s) => s.reason === 'symbol-run')!.rows.length).toBeGreaterThan(9);
    expect(a.score).toBe(1 - PER_ROW_CAP);
    expect(a.fallback).toBe(false);
  });
});

describe('confidence: tables', () => {
  it('flags a text row that cuts a table in two (419 row 10 `Säätila:`)', () => {
    expect(rows(419, 1, 'table-break')).toEqual([10]);
  });

  it('does not see a table break at bracketed notes kept in the table (235)', () => {
    for (const sp of [1, 3, 4]) {
      expect(sub(235, sp).reasons, `235/${sp}`).not.toContain('table-break');
    }
  });

  it('flags a double-height heading set in columns: a diagram (419 row 4)', () => {
    expect(rows(419, 1, 'heading-columns')).toEqual([4]);
    expect(sub(103).reasons).not.toContain('heading-columns'); // 103 row 3 is a real heading
  });

  it('trusts results tables and standings (260, 230, 242, 298/1, 299/1, 406)', () => {
    for (const [n, sp] of [
      [260, 1],
      [260, 4],
      [230, 1],
      [242, 3],
      [298, 1],
      [299, 1],
      [406, 1],
    ]) {
      expect(sub(n, sp).reasons, `${n}/${sp}`).toEqual([]);
    }
  });

  it('keeps table rows verbatim: every non-decoration cell as Yle sent it (all fixtures)', () => {
    const files = readdirSync(pagesDir).filter((f) => f.endsWith('.json'));
    let checked = 0;
    for (const file of files) {
      const p = load(file.replace('.json', ''));
      if (!p) continue;
      for (const sp of classify(p)) {
        for (const l of sp.lines) {
          if (l.kind !== 'table') continue;
          const where = `${p.number}/${sp.number} row ${l.number}`;
          expect(l.text.length, where).toBe(l.line.text.length);
          // A `band-header` row's title piece (176 `OMXH Large Cap`) moved to `title`: put it back.
          let text = l.text;
          if (l.title !== undefined) {
            const at = l.line.text.indexOf(l.title);
            expect(at, where).toBeGreaterThanOrEqual(0);
            expect(text.slice(at, at + l.title.length).trim(), where).toBe('');
            text = text.slice(0, at) + l.title + text.slice(at + l.title.length);
          }
          for (const r of l.line.runs) {
            if (isDecorationRun(r)) continue;
            expect(text.slice(r.column, r.column + r.text.length), where).toBe(r.text);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('keeps columns lined up across consecutive table rows (230 points, 260 scores)', () => {
    const at = (n: number, r: number) => classified(n)[0].lines.find((l) => l.number === r)!.text;
    // 230: the last column (points) ends at the same cell on every team row.
    const ends = [3, 4, 5, 6, 7].map((r) => at(230, r).trimEnd().length);
    expect(new Set(ends).size).toBe(1);
    // 260 row 5: the score `185-127` stays one cell group, not a link range.
    expect(at(260, 5)).toContain('185-127');
  });
});

describe('confidence: oversized rows (PUB.11)', () => {
  /** Fixture `n` with row `row` of subpage index `spIndex` sent as one over-long run. */
  function oversized(n: number, spIndex: number, row: number, text: string): ClassifiedSubpage[] {
    const raw = JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8'));
    const sp = [raw.teletext.page.subpage].flat()[spIndex];
    const line = sp.content.find((c: any) => c.type === 'structured').line[row - 1];
    line.run = [{ bg: 'black', fg: 'white', length: '40', Text: text }];
    const result = normalize(raw);
    if (!result.ok) throw new Error(result.error.message);
    return classify(result.page);
  }

  it('falls back when a row had text cut at 40 columns, naming the row (103 row 7)', () => {
    const text = ' kannattaa olla tarkkana: huonosta      ja tämä teksti ei mahdu riville';
    const a = assessPage(oversized(103, 0, 7, text));
    expect(a.subpages[0].reasons).toContain('oversized-row');
    expect(a.subpages[0].signals.find((s) => s.reason === 'oversized-row')?.rows).toEqual([7]);
    expect(a.fallback).toBe(true);
    expect(sub(103).reasons).not.toContain('oversized-row');
  });

  it('only the subpage with the cut row shows the image (260 subpage 1 of 4)', () => {
    const a = assessPage(oversized(260, 0, 5, 'x'.repeat(5000)));
    expect(a.subpages.map((s) => s.fallback)).toEqual(
      assess(260).subpages.map((s, i) => i === 0 || s.fallback),
    );
    expect(a.fallback).toBe(false);
  });

  it('does not fall back when only spaces were cut (103 row 7)', () => {
    const a = assessPage(
      oversized(103, 0, 7, ' kannattaa olla tarkkana: huonosta' + ' '.repeat(20)),
    );
    expect(a.subpages[0].reasons).not.toContain('oversized-row');
    expect(a.fallback).toBe(false);
  });
});

describe('confidence: page verdict', () => {
  it('shows only the bad subpage as an image when the rest reads well (299: subpage 2 of 2)', () => {
    const a = assess(299);
    expect(a.fallback).toBe(false);
    expect(a.subpages.map((s) => s.fallback)).toEqual([false, true]);
    expect(a.score).toBe(sub(299, 2).score);
  });

  it('falls back for the whole page when most subpages do (420, 890 without `all`)', () => {
    expect(assess(420).fallback).toBe(true);
    expect(assess(890, true).fallback).toBe(true);
  });

  it('collects reasons from all subpages without repeats (199)', () => {
    expect(assess(199).reasons).toEqual(['nav-orphan-text']);
  });
});

describe('confidence: sweep over every fixture', () => {
  const files = readdirSync(pagesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const results = new Map<number, PageAssessment>();
  for (const file of files) {
    const p = load(file.replace('.json', ''));
    if (p) results.set(p.number, assessPage(classify(p)));
  }

  /**
   * The full verdict list. A change here means a heuristic changed what users
   * see: check the page against fixtures/images/<n>.png before updating.
   */
  const FALLBACK_SUBPAGES = ['299/2', '420/1'];
  const FALLBACK_PAGES = [420];
  const LOW_CONFIDENCE_PAGES = [199, 299, 419, 420, 500];

  it('falls back exactly on the expected subpages', () => {
    const got = [...results].flatMap(([n, a]) =>
      a.subpages.filter((s) => s.fallback).map((s) => `${n}/${s.number}`),
    );
    expect(got.sort()).toEqual(FALLBACK_SUBPAGES);
  });

  it('falls back exactly on the expected whole pages', () => {
    const got = [...results].filter(([, a]) => a.fallback).map(([n]) => n);
    expect(got.sort()).toEqual(FALLBACK_PAGES);
  });

  it('reports exactly the expected low-confidence pages', () => {
    const got = [...results].filter(([, a]) => a.lowConfidence).map(([n]) => n);
    expect(got.sort()).toEqual(LOW_CONFIDENCE_PAGES);
  });

  it('never falls back on news articles, indexes or results tables', () => {
    for (const n of [100, 102, 103, 104, 105, 160, 161, 162, 163, 200, 260, 417, 725]) {
      const a = results.get(n)!;
      expect(a.fallback, `${n}`).toBe(false);
      expect(
        a.subpages.some((s) => s.fallback),
        `${n}`,
      ).toBe(false);
    }
  });

  it('keeps every score in 0..1 and every verdict consistent with it', () => {
    for (const [n, a] of results) {
      for (const s of [a, ...a.subpages]) {
        expect(s.score, `${n}`).toBeGreaterThanOrEqual(0);
        expect(s.score, `${n}`).toBeLessThanOrEqual(1);
        expect(s.lowConfidence, `${n}`).toBe(s.score < LOW_CONFIDENCE_BELOW);
      }
      for (const s of a.subpages) expect(s.fallback, `${n}`).toBe(s.score < FALLBACK_BELOW);
    }
  });
});
