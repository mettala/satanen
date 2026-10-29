/**
 * Which section a page belongs to, for colour and label (D19: by page number,
 * the way Teksti-TV itself numbers things). Pure; no React Native imports.
 *
 * Kotimaa 102-129, Ulkomaat 130-159, Talous 160-189, Urheilu 2xx, Sää 4xx.
 * Everything else is grey (`other`) and named after its hundred-block
 * (Ohjelmat 3xx, Alueet 5xx, Svenska 7xx ...), or "Uutiset" for 100, 101 and
 * 190-199, or "Muut" when nothing fits.
 */
import { t } from '../i18n';
import type { SectionId } from '../theme';

export interface SectionInfo {
  readonly id: SectionId;
  /** Finnish name as written in the UI (caps is a style, not part of the text). */
  readonly label: string;
}

const s = t.lists.sections;

export function sectionOf(page: number): SectionInfo {
  if (page >= 102 && page <= 129) return { id: 'news', label: s.domestic };
  if (page >= 130 && page <= 159) return { id: 'world', label: s.foreign };
  if (page >= 160 && page <= 189) return { id: 'business', label: t.sectionTitles.business };
  if (page >= 200 && page <= 299) return { id: 'sport', label: t.sectionTitles.sport };
  if (page >= 400 && page <= 499) return { id: 'weather', label: t.sectionTitles.weather };
  if (page >= 100 && page <= 199) return { id: 'other', label: s.news };
  if (page >= 300 && page <= 399) return { id: 'other', label: s.programmes };
  if (page >= 500 && page <= 599) return { id: 'other', label: s.regions };
  if (page >= 700 && page <= 799) return { id: 'other', label: s.swedish };
  if (page >= 800 && page <= 899) return { id: 'other', label: s.weekly };
  return { id: 'other', label: s.other };
}
