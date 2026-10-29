/**
 * Extracts "page number → title" pairs from index-page rows.
 *
 * The rule (docs/YLE-API.md "Page names for type-ahead"): a link run to a
 * 3-digit page followed by its title text on the same row. Ranges arrive as
 * three runs — link, `-`, link — and comma lists as link, `,`, link; both
 * share the title that follows. A page number that only has text *before* it
 * (e.g. "Aakkosellinen hakemisto 196-198") yields nothing, because the title
 * must come after the number.
 *
 * Two bits of decoration are dropped, matching the parser's other layers:
 * page links Yle marks inside mosaic graphics (docs/YLE-API.md quirk 20) and
 * mosaic/graphics runs inside a title. Entries whose title has no letters
 * (only digits or punctuation) are skipped too.
 *
 * Titles are used exactly as Yle sent them (licence: don't reword content);
 * only surrounding whitespace is trimmed.
 */
import type { Line, Page, Run } from '../parser/model';
import type { PageEntry, PageRef } from './types';

/** A run Yle marked as a link to another page, and not mosaic graphics. */
function pageOf(run: Run): number | undefined {
  if (run.graphics) return undefined;
  return run.link?.kind === 'page' ? run.link.page : undefined;
}

/**
 * A separator between page numbers in a range/list: no link, not graphics, and
 * only dashes and/or commas (whitespace around them is fine). A run of just
 * spaces is a gap, not a separator.
 */
function isSeparator(run: Run): boolean {
  if (run.link) return false;
  if (run.graphics) return false;
  if (!run.hasText) return false;
  return /^[\-,]+$/.test(run.text.trim());
}

/** Collapse a comma-separated group of pages/dashes into PageRefs. */
function groupToRef(pages: number[]): PageRef {
  if (pages.length === 1) return pages[0];
  return { from: pages[0], to: pages[pages.length - 1] };
}

/**
 * Read the run of page links starting at `start` (which must be a page link).
 * Returns the refs (a single page, a range, or several for a comma list) and
 * the index of the first run after the numbers.
 */
function readNumbers(runs: Run[], start: number): { refs: PageRef[]; next: number } {
  const pages: number[] = [];
  const separators: string[] = [];
  let i = start;
  pages.push(pageOf(runs[i])!);
  i += 1;
  while (i + 1 < runs.length) {
    const sep = runs[i];
    const next = runs[i + 1];
    if (isSeparator(sep) && pageOf(next) !== undefined) {
      separators.push(sep.text.trim());
      pages.push(pageOf(next)!);
      i += 2;
    } else {
      break;
    }
  }

  const refs: PageRef[] = [];
  let group: number[] = [pages[0]];
  for (let k = 0; k < separators.length; k += 1) {
    if (separators[k].includes(',')) {
      refs.push(groupToRef(group));
      group = [pages[k + 1]];
    } else {
      group.push(pages[k + 1]);
    }
  }
  refs.push(groupToRef(group));
  return { refs, next: i };
}

/**
 * The title text after a number group: non-link, non-graphics runs up to the
 * next page link or the next run of 2+ spaces (a column gap: the text after it
 * belongs to another column, e.g. "Talous              hakemisto").
 */
function readTitle(runs: Run[], start: number): string {
  let title = '';
  for (let i = start; i < runs.length; i += 1) {
    const run = runs[i];
    if (pageOf(run) !== undefined) break;
    if (run.link || run.graphics) continue;
    title += run.text;
    if (/\S {2,}/.test(title.trimStart())) break;
  }
  return title.trimStart().split(/ {2,}/)[0].trim();
}

/**
 * A page number starts an entry only at the start of the row's content, after
 * a column gap (2+ spaces), or after an entry already read on this row
 * ("306 Ava 307 Liv"). A number inside a sentence ("Sivuilla 301,302,
 * 310-317 ja ...", "sivuilla 411-413. Koko") is not an entry.
 */
function startsEntry(runs: Run[], index: number, afterEntry: boolean): boolean {
  if (afterEntry) return true;
  let before = '';
  for (let k = 0; k < index; k += 1) {
    if (!runs[k].graphics) before += runs[k].text;
  }
  return before.trim() === '' || /\s{2,}$/.test(before);
}

const HAS_LETTER = /[\p{L}]/u;

/** Extract every page/range → title pair from one index line, left to right. */
export function extractLineEntries(line: Line): PageEntry[] {
  const entries: PageEntry[] = [];
  const runs = line.runs;
  let i = 0;
  let afterEntry = false;
  while (i < runs.length) {
    if (pageOf(runs[i]) === undefined) {
      i += 1;
      continue;
    }
    const { refs, next } = readNumbers(runs, i);
    const title = readTitle(runs, next);
    if (startsEntry(runs, i, afterEntry) && HAS_LETTER.test(title)) {
      for (const page of refs) entries.push({ page, title });
      afterEntry = true;
    }
    i = next;
  }
  return entries;
}

/** Extract page → title pairs from every subpage of an index page. */
export function extractIndexEntries(page: Page): PageEntry[] {
  return page.subpages.flatMap((subpage) => subpage.lines.flatMap(extractLineEntries));
}

function refStart(page: PageRef): number {
  return typeof page === 'number' ? page : page.from;
}

function refEnd(page: PageRef): number {
  return typeof page === 'number' ? page : page.to;
}

function refKey(page: PageRef): string {
  return typeof page === 'number' ? String(page) : `${page.from}-${page.to}`;
}

/**
 * De-duplicate (first occurrence wins) and sort by page number, then range
 * end. Deterministic: given the same input order it always returns the same
 * output.
 */
export function mergeEntries(entries: PageEntry[]): PageEntry[] {
  const seen = new Map<string, PageEntry>();
  for (const entry of entries) {
    const key = refKey(entry.page);
    if (!seen.has(key)) seen.set(key, entry);
  }
  return [...seen.values()].sort(
    (a, b) => refStart(a.page) - refStart(b.page) || refEnd(a.page) - refEnd(b.page),
  );
}
