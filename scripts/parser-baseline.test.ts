/**
 * "No worse than main" for the parser: every fixture page is analysed (the same
 * numbers `npm run parser-report` prints) and compared with the committed
 * fixtures/parser-report.baseline.json. A page that newly falls back or reads
 * with low confidence fails the test. Better results never fail it.
 *
 * To accept a change (better, or a deliberate trade-off), run
 * `UPDATE_PARSER_BASELINE=1 npx vitest run scripts/parser-baseline.test.ts`
 * and commit the new baseline file.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { analysePage, reportRow } from '../src/parser/analyse';

const ROOT = join(__dirname, '..');
const pagesDir = join(ROOT, 'fixtures', 'pages');
const baselineFile = join(ROOT, 'fixtures', 'parser-report.baseline.json');

interface Baseline {
  pages: number;
  fallback: number[];
  lowConfidence: number[];
}

function current(): Baseline {
  const rows = readdirSync(pagesDir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => {
      const raw: unknown = JSON.parse(readFileSync(join(pagesDir, f), 'utf8'));
      return reportRow(Number.parseInt(f, 10), analysePage(raw));
    })
    .sort((a, b) => a.page - b.page);
  return {
    pages: rows.length,
    fallback: rows.filter((r) => r.fallback).map((r) => r.page),
    lowConfidence: rows.filter((r) => r.lowConfidence).map((r) => r.page),
  };
}

const HOW_TO_UPDATE =
  'If this is expected, update the baseline: ' +
  'UPDATE_PARSER_BASELINE=1 npx vitest run scripts/parser-baseline.test.ts, then commit it.';

describe('parser report baseline', () => {
  const now = current();

  if (process.env.UPDATE_PARSER_BASELINE) {
    it('writes the baseline', () => {
      const list = (a: number[]) => `[${a.join(', ')}]`;
      writeFileSync(
        baselineFile,
        `{\n  "pages": ${now.pages},\n  "fallback": ${list(now.fallback)},\n  "lowConfidence": ${list(now.lowConfidence)}\n}\n`,
      );
    });
    return;
  }

  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Baseline;

  it('has no page that newly falls back', () => {
    const worse = now.fallback.filter((p) => !baseline.fallback.includes(p));
    expect(worse, `Pages now falling back: ${worse.join(', ')}. ${HOW_TO_UPDATE}`).toEqual([]);
  });

  it('has no page that newly reads with low confidence', () => {
    const worse = now.lowConfidence.filter((p) => !baseline.lowConfidence.includes(p));
    expect(worse, `Pages now low confidence: ${worse.join(', ')}. ${HOW_TO_UPDATE}`).toEqual([]);
  });

  it('tells you when the baseline can be tightened', () => {
    const better = [...baseline.fallback, ...baseline.lowConfidence].filter(
      (p) => !now.fallback.includes(p) && !now.lowConfidence.includes(p),
    );
    if (better.length > 0) {
      console.info(`Parser improved on pages ${better.join(', ')}. ${HOW_TO_UPDATE}`);
    }
    expect(now.pages).toBeGreaterThanOrEqual(baseline.pages);
  });
});
