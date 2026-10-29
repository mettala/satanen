/**
 * Type-ahead for the "Siirry sivulle" jump sheet.
 *
 * Pure and deterministic. `suggest("2")` returns the Urheilu section group
 * first, then its subsections; `suggest("23")` narrows to 23x; `suggest("230")`
 * returns the exact page first. Non-digit or empty input returns [].
 */
import type { SectionId } from '../theme';
import { SECTION_MAP } from './sectionMap.generated';
import { SUB_RANGES, TOP_SECTIONS } from './sections';
import type { PageEntry, PageRange, PageRef, Suggestion } from './types';

export const DEFAULT_LIMIT = 8;

function refStart(page: PageRef): number {
  return typeof page === 'number' ? page : page.from;
}

function refEnd(page: PageRef): number {
  return typeof page === 'number' ? page : page.to;
}

function matchesPrefix(page: PageRef, digits: string): boolean {
  if (typeof page === 'number') return String(page).startsWith(digits);
  return String(page.from).startsWith(digits) || String(page.to).startsWith(digits);
}

function isSectionRoot(page: PageRef): boolean {
  return typeof page === 'number' && TOP_SECTIONS.some((section) => section.root === page);
}

function sectionIdFor(page: PageRef): SectionId {
  const start = refStart(page);
  const sub = SUB_RANGES.find((range) => start >= range.from && start <= range.to);
  if (sub) return sub.id;
  return (
    TOP_SECTIONS.find((section) => start >= section.from && start <= section.to)?.id ?? 'other'
  );
}

/**
 * Ordered suggestions for the digits typed so far. A single leading digit also
 * suggests its hundred-block section group (e.g. "2" → "Urheilu · 2xx"); a
 * full three-digit page number is suggested first.
 */
export function suggest(
  input: string,
  limit = DEFAULT_LIMIT,
  map: readonly PageEntry[] = SECTION_MAP,
): Suggestion[] {
  const digits = input.trim();
  if (digits === '' || !/^\d+$/.test(digits)) return [];

  const results: Suggestion[] = [];

  if (digits.length === 1) {
    for (const section of TOP_SECTIONS) {
      if (String(section.from).startsWith(digits)) {
        results.push({
          page: { from: section.from, to: section.to } satisfies PageRange,
          title: section.title,
          sectionId: section.id,
        });
      }
    }
  }

  const matches = map
    .filter((entry) => !isSectionRoot(entry.page) && matchesPrefix(entry.page, digits))
    .map((entry) => ({ ...entry, sectionId: sectionIdFor(entry.page) }))
    .sort((a, b) => refStart(a.page) - refStart(b.page) || refEnd(a.page) - refEnd(b.page));

  const num = Number(digits);
  if (digits.length === 3) {
    const exactIndex = matches.findIndex((entry) => entry.page === num);
    if (exactIndex !== -1) {
      const [exact] = matches.splice(exactIndex, 1);
      results.push(exact);
    }
  }

  results.push(...matches);
  return results.slice(0, limit);
}
