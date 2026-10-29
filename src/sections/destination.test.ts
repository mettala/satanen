import { describe, expect, it } from 'vitest';

import { hasTab, hrefOfPage } from './destination';
import { MENU_SECTIONS } from './menu';

describe('hrefOfPage', () => {
  it('sends the news, business and sport indexes (200 is Urheilu, 201 its headlines) to their tabs', () => {
    expect(hrefOfPage(100)).toBe('/');
    expect(hrefOfPage(102)).toBe('/uutiset?chip=kotimaa');
    expect(hrefOfPage(130)).toBe('/uutiset?chip=ulkomaat');
    expect(hrefOfPage(160)).toBe('/talous');
    expect(hrefOfPage(200)).toBe('/urheilu');
    expect(hrefOfPage(201)).toBe('/urheilu-uutiset');
    expect(hrefOfPage(400)).toBe('/saa');
  });

  it('opens any other page as an article', () => {
    expect(hrefOfPage(136)).toBe('/136');
    expect(hasTab(136)).toBe(false);
    expect(hasTab(102)).toBe(true);
  });

  it('keeps the menu sections without a tab as articles', () => {
    for (const s of MENU_SECTIONS.filter((m) => !hasTab(m.page))) {
      expect(hrefOfPage(s.page)).toBe(`/${s.page}`);
    }
  });
});
