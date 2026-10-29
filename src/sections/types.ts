/**
 * Shared types for the section map and type-ahead suggestions.
 *
 * Pure TypeScript: no React Native imports. `sectionId` reuses the theme's
 * `SectionId` so a suggestion's colour always matches a colour token
 * (sections without their own colour fall back to `'other'`, see src/theme).
 */
import type { SectionId } from '../theme';

/** An inclusive range of page numbers, e.g. `{ from: 201, to: 209 }`. */
export interface PageRange {
  readonly from: number;
  readonly to: number;
}

/** Either a single page or a range of pages. */
export type PageRef = number | PageRange;

/** A "page → title" pair extracted from an index page. */
export interface PageEntry {
  readonly page: PageRef;
  readonly title: string;
}

/** A type-ahead suggestion: a page or range, its title and a section colour id. */
export interface Suggestion extends PageEntry {
  readonly sectionId: SectionId;
}
