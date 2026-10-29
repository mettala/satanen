import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildEntries, INDEX_PAGES, renderSectionMap, renderStringLiteral } from './generate';
import { readIndexPages } from './indexSource';
import { SECTION_MAP } from './sectionMap.generated';
import type { PageEntry } from './types';

/** Titles that would break a naive `'${title}'` literal (Yle text is data). */
const HOSTILE_TITLES = [
  "x\\';globalThis.PWNED=1;//",
  'back\\slash',
  "it's",
  'say "hi"',
  'line one\nline two',
  'carriage\rreturn',
  'tab\there',
  'a separator',
  'block */ comment /* open',
  'template ${globalThis.PWNED = 1} `tick`',
];

/** Evaluate the emitted literal and return the string it produces. */
function evaluateLiteral(literal: string): unknown {
  return new Function(`return ${literal};`)();
}

/** Read entries back out of a rendered module (strict: any odd entry line throws). */
function parseRendered(source: string): PageEntry[] {
  const entries: PageEntry[] = [];
  for (const line of source.split('\n')) {
    if (!line.startsWith(' ') || !line.includes('page:')) continue;
    const m = /^ {2}\{ page: (\d+|\{ from: \d+, to: \d+ \}), title: ('(?:[^'\\]|\\.)*') \},$/.exec(
      line,
    );
    if (!m) throw new Error(`unexpected entry line: ${line}`);
    const page = new Function(`return ${m[1]};`)() as PageEntry['page'];
    entries.push({ page, title: evaluateLiteral(m[2]!) as string });
  }
  return entries;
}

/** Rules a weekly map must keep, whatever Yle changed (no fixtures involved). */
function mapProblems(entries: readonly PageEntry[]): string[] {
  const problems: string[] = [];
  const start = (e: PageEntry) => (typeof e.page === 'number' ? e.page : e.page.from);
  const end = (e: PageEntry) => (typeof e.page === 'number' ? e.page : e.page.to);
  if (entries.length < 50) problems.push('fewer than 50 entries');
  if (!entries.some((e) => e.page === 100)) problems.push('page 100 missing');
  if (entries.some((e) => start(e) < 100 || end(e) > 899)) problems.push('page outside 100-899');
  const starts = entries.map(start);
  if (starts.some((s, i) => i > 0 && s < starts[i - 1]!)) problems.push('not sorted by page');
  if (entries.some((e) => e.title.trim() === '')) problems.push('empty title');
  return problems;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(here, '../..');
const pagesDir = resolve(rootDir, 'fixtures/pages');
const generatedPath = resolve(here, 'sectionMap.generated.ts');

describe('section map generation', () => {
  it('reads every listed index page from the fixtures', () => {
    for (const page of INDEX_PAGES) {
      const raw = readFileSync(resolve(pagesDir, `${page}.json`), 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });

  it('builds sorted, de-duplicated entries from the index pages', () => {
    const entries = buildEntries(readIndexPages(rootDir));
    expect(entries.length).toBeGreaterThan(100);
    const starts = entries.map((e) => (typeof e.page === 'number' ? e.page : e.page.from));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('committed sectionMap.generated.ts is its own map rendered back', () => {
    expect(readFileSync(generatedPath, 'utf8')).toBe(renderSectionMap(SECTION_MAP));
  });

  it('the committed map passes the sanity rules (independent of the fixtures)', () => {
    expect(mapProblems(SECTION_MAP)).toEqual([]);
  });

  it('the sanity rules reject a map without page 100, with an empty title, or out of order', () => {
    const no100 = SECTION_MAP.filter((e) => e.page !== 100);
    expect(mapProblems(no100)).toContain('page 100 missing');
    const empty = SECTION_MAP.map((e, i) => (i === 3 ? { ...e, title: '  ' } : e));
    expect(mapProblems(empty)).toContain('empty title');
    expect(mapProblems([...SECTION_MAP].reverse())).toContain('not sorted by page');
    expect(mapProblems(SECTION_MAP.slice(0, 10))).toContain('fewer than 50 entries');
    const outside = [...SECTION_MAP, { page: 900, title: 'Liian suuri' }];
    expect(mapProblems(outside)).toContain('page outside 100-899');
  });

  it('a weekly update (25 % new titles, 2 new entries) passes every map check', () => {
    const base: PageEntry[] = Array.from({ length: 60 }, (_, i) => ({
      page: 100 + i * 2,
      title: `Osio ${i}`,
    }));
    const updated: PageEntry[] = base.map((e, i) =>
      i % 4 === 0 ? { ...e, title: `${e.title} uusi` } : e,
    );
    updated.push({ page: 898, title: 'Uusi osio' }, { page: 899, title: 'Toinen uusi' });
    const source = renderSectionMap(updated);
    expect(mapProblems(updated)).toEqual([]);
    expect(parseRendered(source)).toEqual(updated);
    expect(renderSectionMap(parseRendered(source))).toBe(source);
  });

  it('a live update with a changed title still passes the render-back check', () => {
    const changed = SECTION_MAP.map((e, i) => (i === 0 ? { ...e, title: 'Uusi otsikko' } : e));
    const source = renderSectionMap(changed);
    expect(source).not.toBe(readFileSync(generatedPath, 'utf8'));
    expect(parseRendered(source)).toEqual(changed);
    expect(renderSectionMap(parseRendered(source))).toBe(source);
  });

  it('a hand-edited format or a broken literal fails the render-back check', () => {
    const good = readFileSync(generatedPath, 'utf8');
    const spaced = good.replace('{ page:', '{  page:');
    expect(() => parseRendered(spaced)).toThrow();
    const broken = good.replace(/title: '/, "title: 'x'; evil('");
    expect(() => parseRendered(broken)).toThrow();
  });
});

describe('title escaping in the generated map', () => {
  it.each(HOSTILE_TITLES)('emits a literal that evaluates back to exactly %j', (title) => {
    const literal = renderStringLiteral(title);
    expect(evaluateLiteral(literal)).toBe(title);
  });

  it('keeps the exact breakout case inert', () => {
    const title = "x\\';globalThis.PWNED=1;//";
    const literal = renderStringLiteral(title);
    expect(evaluateLiteral(literal)).toBe(title);
    expect((globalThis as { PWNED?: unknown }).PWNED).toBeUndefined();
  });

  it('a hostile title in the rendered module stays a single entry line', () => {
    const title = "x\\';globalThis.PWNED=1;//";
    const source = renderSectionMap([{ page: 1, title }]);
    const entryLines = source.split('\n').filter((line) => line.includes('page: 1,'));
    expect(entryLines).toHaveLength(1);
    const match = /^ {2}\{ page: 1, title: (.+) \},$/.exec(entryLines[0]!);
    expect(match).not.toBeNull();
    expect(evaluateLiteral(match![1]!)).toBe(title);
    expect(source.split('\n').filter((line) => line.includes('PWNED'))).toEqual(entryLines);
  });
});
