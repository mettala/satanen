import { describe, expect, it } from 'vitest';

import { fi } from './fi';

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (typeof value === 'function') {
    return [value(2, 3, '14:32')];
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }

  return [];
}

describe('Finnish UI strings', () => {
  const strings = collectStrings(fi);

  it('has no exclamation marks', () => {
    expect(strings.filter((text) => text.includes('!'))).toEqual([]);
  });

  it('has no empty strings', () => {
    expect(strings.filter((text) => text.trim() === '')).toEqual([]);
  });

  it('uses the required attribution', () => {
    expect(fi.common.attribution).toBe('Sisältö: Yle Teksti-TV');
  });

  it('names the weather section in full for titles and short for the tab', () => {
    expect(fi.sectionTitles.weather).toBe('Sää ja liikenne');
    expect(fi.tabs.weather).toBe('Sää');
  });

  it('has a big title for each of the four section screens', () => {
    expect(Object.keys(fi.sectionTitles).sort()).toEqual(['business', 'news', 'sport', 'weather']);
  });
});
