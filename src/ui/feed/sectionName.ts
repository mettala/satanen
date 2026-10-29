import { t } from '../../i18n';
import type { SectionId } from '../../theme';

/** Name shown in a feed item's label. Comes from the item's own section, never from `sectionOf(page)`. */
export function feedSectionName(section: SectionId): string {
  return t.feed.sectionNames[section];
}
