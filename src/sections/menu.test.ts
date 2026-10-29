import { describe, expect, it } from 'vitest';

import { fi } from '../i18n/fi';
import { activeTab } from '../ui/activeTab';
import { hasTab, hrefOfPage } from './destination';
import { MENU_SECTIONS } from './menu';

describe('MENU_SECTIONS', () => {
  it('lists the owner’s pages in the owner’s order, with their labels', () => {
    expect(MENU_SECTIONS.map((s) => [s.page, fi.drawer.sections[s.key]])).toEqual([
      [100, 'Etusivu'],
      [102, 'Kotimaa'],
      [130, 'Ulkomaat'],
      [160, 'Talous'],
      [201, 'Urheilu'],
      [300, 'TV-ohjelmat'],
      [350, 'Ohjelmaopas'],
      [400, 'Sää ja liikenne'],
      [470, 'Veikkaus'],
      [500, 'Alueuutiset'],
      [800, 'Viikkomakasiini'],
      [190, 'News in English'],
      [700, 'Nyheter på svenska'],
      [199, 'Hakemisto'],
    ]);
  });

  it('puts Viimeksi luetut first, above the pages', () => {
    expect(fi.drawer.recent).toBe('Viimeksi luetut');
  });

  it('uses the full Sää ja liikenne name from sectionTitles', () => {
    expect(fi.drawer.sections.weather).toBe(fi.sectionTitles.weather);
  });

  it('only links to valid teletext pages (100-899)', () => {
    for (const s of MENU_SECTIONS) {
      expect(Number.isInteger(s.page)).toBe(true);
      expect(s.page).toBeGreaterThanOrEqual(100);
      expect(s.page).toBeLessThanOrEqual(899);
    }
  });

  it('has no duplicate keys or pages', () => {
    const keys = MENU_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const pages = MENU_SECTIONS.map((s) => s.page);
    expect(new Set(pages).size).toBe(pages.length);
  });

  it('covers every label in the strings file', () => {
    expect(MENU_SECTIONS.map((s) => s.key).sort()).toEqual(Object.keys(fi.drawer.sections).sort());
  });

  it('opens the tab pages on their tabs', () => {
    const href = (p: number) => hrefOfPage(p);
    expect(href(100)).toBe('/');
    expect(href(102)).toBe('/uutiset?chip=kotimaa');
    expect(href(130)).toBe('/uutiset?chip=ulkomaat');
    expect(href(160)).toBe('/talous');
    expect(href(201)).toBe('/urheilu-uutiset');
    expect(href(400)).toBe('/saa');
  });

  it('opens the pages without a tab as plain pages that highlight no bottom tab', () => {
    const plain = [300, 350, 470, 500, 800, 190, 700, 199];
    for (const p of plain) {
      expect(MENU_SECTIONS.some((s) => s.page === p)).toBe(true);
      expect(hasTab(p)).toBe(false);
      expect(hrefOfPage(p)).toBe(`/${p}`);
      expect(activeTab(hrefOfPage(p))).toBeNull();
    }
  });
});
