/**
 * Where a section's index page opens in the app. Pages 100, 102, 130, 160, 200,
 * 201 and 400 are the raw teletext indexes; the app shows them as the Etusivu and
 * feed tabs instead, so the ☰ menu, the jump sheet and links all land on the
 * same screen as the bottom bar. Every other page opens as an article.
 */
const TAB_OF_PAGE: Readonly<Record<number, string>> = {
  100: '/',
  102: '/uutiset?chip=kotimaa',
  130: '/uutiset?chip=ulkomaat',
  160: '/talous',
  200: '/urheilu',
  201: '/urheilu-uutiset',
  400: '/saa',
};

export function hrefOfPage(page: number): string {
  return TAB_OF_PAGE[page] ?? `/${page}`;
}

/** True when the page has a tab screen of its own instead of the article view. */
export function hasTab(page: number): boolean {
  return page in TAB_OF_PAGE;
}
