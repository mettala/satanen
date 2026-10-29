import { describe, expect, it } from 'vitest';

import { fi } from '../../i18n/fi';
import { sectionOf } from '../../sections/sectionOf';
import { sectionLabelRows } from './sectionLabelRows';

describe('sectionLabelRows', () => {
  it('puts the section on the first row and date and time below it', () => {
    expect(sectionLabelRows('Kotimaa', fi.article.dateTime('25.10.', '20:42'))).toEqual({
      name: 'Kotimaa',
      detail: '25.10. klo 20:42',
    });
  });

  it('keeps a page number and count as the second row', () => {
    expect(sectionLabelRows('Urheilu', '235 · 4')).toEqual({ name: 'Urheilu', detail: '235 · 4' });
    expect(sectionLabelRows('Urheilu', 235).detail).toBe('235');
  });

  it('has no second row without a suffix', () => {
    expect(sectionLabelRows('Talous')).toEqual({ name: 'Talous', detail: null });
    expect(sectionLabelRows('Talous', '').detail).toBeNull();
  });

  it('uses the long weather name from one source in page and feed labels', () => {
    expect(sectionOf(408).label).toBe(fi.sectionTitles.weather);
    expect(fi.feed.sectionNames.weather).toBe(fi.sectionTitles.weather);
  });
});
