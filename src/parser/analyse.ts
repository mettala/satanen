/**
 * One call that runs the whole parser pipeline on a raw API response:
 * normalise → classify → reader blocks + confidence. Used by the dev preview
 * screen and the `parser-report` script so both show the same verdicts.
 */
import { classify } from './classify';
import { toReaderBlocks, type ReaderBlock } from './blocks';
import { assessPage, type PageAssessment } from './confidence';
import { normalize } from './normalize';
import type { Page } from './model';

export type Analysis =
  | { ok: true; page: Page; blocks: ReaderBlock[]; assessment: PageAssessment }
  | { ok: false; message: string };

export function analysePage(raw: unknown): Analysis {
  const result = normalize(raw);
  if (!result.ok) return { ok: false, message: result.error.message };
  return analyseNormalised(result.page);
}

/** Same as `analysePage` for a page that is already normalised (e.g. from `getPage`). */
export function analyseNormalised(page: Page): Analysis {
  const subpages = classify(page);
  return {
    ok: true,
    page,
    blocks: toReaderBlocks(page, subpages),
    assessment: assessPage(subpages),
  };
}

export interface ReportRow {
  page: number;
  subpages: number;
  score: number;
  lowConfidence: boolean;
  fallback: boolean;
  reasons: string[];
}

export function reportRow(page: number, a: Analysis): ReportRow {
  if (!a.ok) {
    return {
      page,
      subpages: 0,
      score: 0,
      lowConfidence: true,
      fallback: true,
      reasons: ['parse-error'],
    };
  }
  const { assessment: s } = a;
  return {
    page,
    subpages: a.page.subpageCount,
    score: s.score,
    lowConfidence: s.lowConfidence,
    fallback: s.fallback,
    reasons: s.reasons,
  };
}

/** Worst first: fallback pages, then by score, then by page number. */
export function sortReport(rows: readonly ReportRow[]): ReportRow[] {
  return [...rows].sort(
    (a, b) => Number(b.fallback) - Number(a.fallback) || a.score - b.score || a.page - b.page,
  );
}

/** A plain-text table, one row per page. */
export function formatReport(rows: readonly ReportRow[]): string {
  const head = ['page', 'subpages', 'score', 'low', 'fallback', 'reasons'];
  const body = sortReport(rows).map((r) => [
    String(r.page),
    String(r.subpages),
    r.score.toFixed(2),
    r.lowConfidence ? 'yes' : 'no',
    r.fallback ? 'yes' : 'no',
    r.reasons.join(', ') || '-',
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => c.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}
