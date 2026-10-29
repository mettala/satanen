import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  analyseNormalised,
  analysePage,
  formatReport,
  reportRow,
  sortReport,
  type ReportRow,
} from './analyse';
import { LINE_WIDTH, type Line, type Page } from './model';
import { normalize } from './normalize';

const row = (page: number, score: number, fallback = false): ReportRow => ({
  page,
  subpages: 1,
  score,
  lowConfidence: score < 0.8,
  fallback,
  reasons: fallback ? ['graphics-heavy'] : [],
});

describe('report', () => {
  it('sorts worst first', () => {
    const sorted = sortReport([row(300, 1), row(200, 0.7), row(500, 0.3, true), row(100, 1)]);
    expect(sorted.map((r) => r.page)).toEqual([500, 200, 100, 300]);
  });

  it('formats an aligned table', () => {
    const text = formatReport([row(100, 1), row(500, 0.3, true)]);
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^page\s+subpages\s+score\s+low\s+fallback\s+reasons$/);
    expect(lines[2]).toMatch(/^500\s+1\s+0\.30\s+yes\s+yes\s+graphics-heavy$/);
    expect(lines[3]).toMatch(/^100\s+1\s+1\.00\s+no\s+no\s+-$/);
  });

  it('analyses a fixture and survives garbage', () => {
    const raw = JSON.parse(readFileSync('fixtures/pages/100.json', 'utf8'));
    const a = analysePage(raw);
    expect(a.ok).toBe(true);
    expect(reportRow(100, a).page).toBe(100);
    const bad = analysePage({ nope: 1 });
    expect(bad.ok).toBe(false);
    expect(reportRow(1, bad).fallback).toBe(true);
  });
});

/*
 * PUB.11: a malformed page with rows thousands of characters long froze the
 * app (one regex was cubic: 11 rows of 2,000 characters took 44 s). These
 * pages are built from fixture 103. The budget is generous so a slow CI
 * machine passes; the old code missed it by orders of magnitude.
 */
describe('analyse: oversized rows stay fast (PUB.11)', () => {
  const BUDGET_MS = 500;
  const N = 5000;
  const LONG_ROWS: Record<string, string> = {
    'digits then an unclosed bracket': '1'.repeat(N) + ' (' + 'a'.repeat(N),
    'plain text': 'sana '.repeat(N / 5),
    'spaces then a word': ' '.repeat(N) + 'x',
    'dashes and gaps': 'Koti - Vieras  '.repeat(N / 15),
    'one long hyphenated word': 'a'.repeat(N) + '-',
  };

  function fixture103(): any {
    return JSON.parse(readFileSync('fixtures/pages/103.json', 'utf8'));
  }

  function timed<T>(f: () => T): { result: T; ms: number } {
    const t0 = performance.now();
    const result = f();
    return { result, ms: performance.now() - t0 };
  }

  for (const [name, text] of Object.entries(LONG_ROWS)) {
    it(`raw page with 11 rows of ${N} characters (${name}): fast, rows cut to 40, subpage falls back`, () => {
      const input = fixture103();
      const lines = input.teletext.page.subpage[0].content[2].line;
      for (let i = 5; i < 16; i++) {
        lines[i].run = [{ bg: 'black', fg: 'white', length: String(text.length), Text: text }];
      }
      const { result: a, ms } = timed(() => analysePage(input));
      expect(ms).toBeLessThan(BUDGET_MS);
      expect(a.ok).toBe(true);
      if (!a.ok) return;
      for (const l of a.page.subpages[0].lines)
        expect(l.text.length).toBeLessThanOrEqual(LINE_WIDTH);
      expect(a.page.subpages[0].lines[5].overflow).toBe(text.slice(LINE_WIDTH));
      // Nothing is lost: the cut text is in the warnings, and the subpage
      // shows Yle's picture instead of a cut-off reader version.
      expect(a.page.warnings.some((w) => w.includes(text.slice(LINE_WIDTH)))).toBe(true);
      expect(a.assessment.fallback).toBe(true);
      expect(a.assessment.reasons).toContain('oversized-row');
    });
  }

  it('length "50000000" (and 1e10) gives a 40-column row, not 50 million spaces', () => {
    const input = fixture103();
    const lines = input.teletext.page.subpage[0].content[2].line;
    lines[5].run = [{ bg: 'black', fg: 'white', length: '50000000' }];
    lines[6].run = [{ bg: 'black', fg: 'white', length: 1e10 }];
    const { result: a, ms } = timed(() => analysePage(input));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.page.subpages[0].lines[5].text).toBe(' '.repeat(LINE_WIDTH));
    expect(a.page.subpages[0].lines[6].text).toBe(' '.repeat(LINE_WIDTH));
    // Blank cells hold no content: nothing was cut, so reader mode stays.
    expect(a.assessment.reasons).not.toContain('oversized-row');
  });

  it('the later steps are fast on long rows too, even without the 40-column cap', () => {
    // Defence in depth: hand-built rows that normalize would never produce,
    // straight into classify, blocks and confidence.
    const base = normalize(fixture103());
    if (!base.ok) throw new Error(base.error.message);
    const texts = Object.values(LONG_ROWS);
    const long = (number: number, text: string): Line => ({
      number,
      text,
      runs: [
        {
          text,
          hasText: true,
          column: 0,
          length: text.length,
          fg: 'white',
          bg: 'black',
          graphics: false,
          doubleHeight: false,
        },
      ],
    });
    const page: Page = {
      ...base.page,
      subpages: [
        {
          number: 1,
          lines: base.page.subpages[0].lines.map((l) =>
            l.number >= 6 && l.number <= 20 ? long(l.number, texts[l.number % texts.length]) : l,
          ),
        },
      ],
    };
    const { result: a, ms } = timed(() => analyseNormalised(page));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(a.ok).toBe(true);
  });
});
