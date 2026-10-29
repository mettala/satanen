/**
 * The top-level section groups, hand-maintained.
 *
 * Each group covers one hundred-block of page numbers (1xx, 2xx, …) so the
 * jump sheet can suggest "Urheilu · 2xx" when the user types `2`. Names and
 * numbers come from the main index (199) and docs/YLE-API.md "Known sections";
 * `id` matches the theme's section colour ids (src/theme) where one exists,
 * everything else falls back to `'other'`.
 *
 * `root` is the group's own index page (its header row in 199); suggestions
 * exclude it so "2xx Urheilu" and the map entry "200 Urheilu" don't both show.
 *
 * 6xx (Suurtapahtumat, Eurojalkapallo) has no header in 199, so it is left
 * out; its pages still appear in the map under `'other'`.
 */
import { t } from '../i18n';
import type { SectionId } from '../theme';

export interface TopSection {
  readonly id: SectionId;
  readonly title: string;
  /** The group's own index page, excluded from subsection suggestions. */
  readonly root: number;
  /** First and last page of the hundred-block. */
  readonly from: number;
  readonly to: number;
}

export const TOP_SECTIONS: readonly TopSection[] = [
  { id: 'news', title: t.lists.sections.news, root: 101, from: 100, to: 199 },
  { id: 'sport', title: t.lists.sections.sport, root: 200, from: 200, to: 299 },
  { id: 'other', title: t.lists.sections.programmes, root: 300, from: 300, to: 399 },
  { id: 'weather', title: t.lists.sections.weather, root: 400, from: 400, to: 499 },
  { id: 'other', title: t.lists.sections.regions, root: 500, from: 500, to: 599 },
  { id: 'other', title: t.lists.sections.swedish, root: 700, from: 700, to: 799 },
  { id: 'other', title: t.lists.sections.weekly, root: 800, from: 800, to: 899 },
];

/**
 * Colour sub-ranges inside a hundred-block, checked before TOP_SECTIONS so a
 * page in 130-159 (Ulkomaat) gets the world colour and 160-189 (Talous) the
 * business colour instead of the generic news colour.
 */
export const SUB_RANGES: readonly { id: SectionId; from: number; to: number }[] = [
  { id: 'world', from: 130, to: 159 },
  { id: 'business', from: 160, to: 189 },
];
