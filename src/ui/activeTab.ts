import type { TabKey } from './TabIcon';

/**
 * Which bottom tab is current for a URL path, or null when none is.
 * Etusivu is the front page (`/`) and page 100; Uutiset is the feed at `/uutiset`; other article pages, Suosikit (in the drawer) and Asetukset highlight no tab.
 */
export function activeTab(pathname: string): TabKey | null {
  switch (pathname) {
    case '':
    case '/':
    case '/100':
      return 'home';
    case '/uutiset':
      return 'news';
    case '/urheilu':
    case '/urheilu-uutiset':
      return 'sport';
    case '/talous':
      return 'business';
    case '/saa':
      return 'weather';
    default:
      return null;
  }
}
