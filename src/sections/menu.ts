/**
 * The ☰ drawer's list of pages, hand-maintained and static, in the order the
 * owner set (RP.3). `Viimeksi luetut` and Asetukset are separate rows in the
 * drawer; this is the list between them.
 *
 * `key` indexes `t.drawer.sections` so names stay in src/i18n/fi.ts; `section`
 * picks the dot colour (pages without their own colour use `'other'`). Where a
 * page opens (a tab or a plain page) is decided by `hrefOfPage`.
 */
import type { SectionId } from '../theme';

export type MenuSectionKey =
  | 'front'
  | 'domestic'
  | 'foreign'
  | 'economy'
  | 'sport'
  | 'tv'
  | 'guide'
  | 'weather'
  | 'betting'
  | 'regions'
  | 'weekly'
  | 'english'
  | 'swedish'
  | 'index';

export interface MenuSection {
  readonly key: MenuSectionKey;
  readonly page: number;
  readonly section: SectionId;
}

export const MENU_SECTIONS: readonly MenuSection[] = [
  { key: 'front', page: 100, section: 'news' },
  { key: 'domestic', page: 102, section: 'news' },
  { key: 'foreign', page: 130, section: 'world' },
  { key: 'economy', page: 160, section: 'business' },
  { key: 'sport', page: 201, section: 'sport' },
  { key: 'tv', page: 300, section: 'other' },
  { key: 'guide', page: 350, section: 'other' },
  { key: 'weather', page: 400, section: 'weather' },
  { key: 'betting', page: 470, section: 'other' },
  { key: 'regions', page: 500, section: 'other' },
  { key: 'weekly', page: 800, section: 'other' },
  { key: 'english', page: 190, section: 'other' },
  { key: 'swedish', page: 700, section: 'other' },
  { key: 'index', page: 199, section: 'other' },
];
