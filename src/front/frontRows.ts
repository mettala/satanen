/**
 * Etusivu as a flat list of rows for a virtualised list (M3.33): the lead,
 * then each section group's label and headlines. Every story row carries its
 * index in Etusivu's list (`etusivuItems`: lead first, then the groups), so
 * the rows on screen can be reported to the feed store, which loads the first
 * paragraphs for them plus the next 6 (D26).
 */
import type { FrontPage, Headline } from './frontPage';
import type { SectionId } from '../theme';

export type FrontRow =
  | { kind: 'lead'; key: string; headline: Headline; index: number }
  | { kind: 'label'; key: string; section: SectionId; page: number; index: number }
  | { kind: 'story'; key: string; headline: Headline; index: number };

/**
 * The rows in screen order. A label row's `index` is its group's first story,
 * so a label on screen counts that story as on screen.
 */
export function frontRows(front: FrontPage): FrontRow[] {
  if (!front.lead) return [];
  const rows: FrontRow[] = [{ kind: 'lead', key: 'lead', headline: front.lead, index: 0 }];
  let index = 1;
  for (const group of front.groups) {
    rows.push({
      kind: 'label',
      key: `label-${group.section}`,
      section: group.section,
      page: group.headlines[0]!.page,
      index,
    });
    for (const headline of group.headlines) {
      rows.push({ kind: 'story', key: `story-${headline.page}`, headline, index });
      index++;
    }
  }
  return rows;
}
