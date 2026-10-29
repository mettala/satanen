import { describe, expect, it } from 'vitest';

import { DEFAULT_LIMIT, suggest } from './suggest';
import type { PageEntry } from './types';

/** Small fixed map: a renamed Yle section must never break these tests. */
const TEST_MAP: readonly PageEntry[] = [
  { page: 100, title: 'Etusivu' },
  { page: 101, title: 'UUTISET' },
  { page: 102, title: 'Kotimaa' },
  { page: 130, title: 'Ulkomaat' },
  { page: 160, title: 'Talous' },
  { page: 172, title: 'Prime-korot' },
  { page: { from: 172, to: 173 }, title: 'Korot ja valuuttakurssit' },
  { page: 174, title: 'Maailman pörssien kursseja' },
  { page: 190, title: 'News in English' },
  { page: 200, title: 'URHEILU' },
  { page: 201, title: 'Urheilu-uutiset' },
  { page: 220, title: 'Palloilusarjat' },
  { page: 223, title: 'JÄÄKIEKKOLIIGA' },
  { page: 226, title: 'MESTIS' },
  { page: 228, title: 'SUOMI-SARJA' },
  { page: 230, title: 'U20 SM-SARJA' },
  { page: 233, title: 'AURORALIIGA' },
  { page: 237, title: 'NHL-TAULUKOT' },
  { page: 400, title: 'SÄÄ JA LIIKENNE' },
  { page: 401, title: 'Säätiedotus' },
];

const s = (input: string, limit = DEFAULT_LIMIT) => suggest(input, limit, TEST_MAP);

describe('suggest', () => {
  it('returns [] for empty or non-digit input', () => {
    expect(s('')).toEqual([]);
    expect(s('   ')).toEqual([]);
    expect(s('abc')).toEqual([]);
    expect(s('2a')).toEqual([]);
  });

  it('suggests the Urheilu section first for "2", then its subsections', () => {
    const all = s('2', 50);
    expect(all[0]).toEqual({ page: { from: 200, to: 299 }, title: 'Urheilu', sectionId: 'sport' });
    const titles = all.map((s) => s.title);
    expect(titles).toContain('Urheilu-uutiset');
    expect(titles).toContain('JÄÄKIEKKOLIIGA');
    expect(titles).toContain('U20 SM-SARJA');
    expect(titles).toContain('NHL-TAULUKOT');
  });

  it('only suggests 2xx subsections for "2" (all sectionId sport)', () => {
    const all = s('2', 50).slice(1);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      const start = typeof s.page === 'number' ? s.page : s.page.from;
      expect(String(start).startsWith('2')).toBe(true);
      expect(s.sectionId).toBe('sport');
    }
  });

  it('narrows "23" to 23x pages', () => {
    const all = s('23', 50);
    expect(all.map((s) => s.page)).toEqual([230, 233, 237]);
    expect(all[0].title).toBe('U20 SM-SARJA');
  });

  it('returns the exact page first for "230"', () => {
    const all = s('230');
    expect(all[0]).toEqual({ page: 230, title: 'U20 SM-SARJA', sectionId: 'sport' });
  });

  it('respects the limit', () => {
    expect(s('2', 3)).toHaveLength(3);
    expect(s('2')).toHaveLength(8);
  });

  it('suggests the Sää section for "4" with weather colour', () => {
    const all = s('4', 20);
    expect(all[0]).toEqual({ page: { from: 400, to: 499 }, title: 'Sää', sectionId: 'weather' });
    expect(all.slice(1).every((s) => s.sectionId === 'weather')).toBe(true);
  });

  it('shows no article headlines with the default limit for "1" and "2"', () => {
    const titles = (input: string) => s(input).map((s) => s.title);
    expect(titles('1')).toEqual([
      'Uutiset',
      'Etusivu',
      'Kotimaa',
      'Ulkomaat',
      'Talous',
      'Prime-korot',
      'Korot ja valuuttakurssit',
      'Maailman pörssien kursseja',
    ]);
    expect(titles('2')).toEqual([
      'Urheilu',
      'Urheilu-uutiset',
      'Palloilusarjat',
      'JÄÄKIEKKOLIIGA',
      'MESTIS',
      'SUOMI-SARJA',
      'U20 SM-SARJA',
      'AURORALIIGA',
    ]);
  });

  it('does not include headlines when narrowing ("23")', () => {
    expect(s('23').map((s) => s.page)).toEqual([230, 233, 237]);
  });

  it('colours Ulkomaat as world and Talous as business', () => {
    const all = s('1', 50);
    expect(all.find((s) => s.page === 130)?.sectionId).toBe('world');
    expect(all.find((s) => s.page === 160)?.sectionId).toBe('business');
    expect(all.find((s) => s.page === 102)?.sectionId).toBe('news');
    expect(all.find((s) => s.page === 190)?.sectionId).toBe('news');
  });
});
