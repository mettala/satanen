import { describe, expect, it } from 'vitest';

import { activeTab } from './activeTab';

describe('activeTab', () => {
  it('maps tab screens to their tab', () => {
    expect(activeTab('/uutiset')).toBe('news');
    expect(activeTab('/urheilu')).toBe('sport');
    expect(activeTab('/urheilu-uutiset')).toBe('sport');
    expect(activeTab('/talous')).toBe('business');
    expect(activeTab('/saa')).toBe('weather');
  });
  it('highlights Etusivu on the front page and on page 100', () => {
    expect(activeTab('/')).toBe('home');
    expect(activeTab('')).toBe('home');
    expect(activeTab('/100')).toBe('home');
    expect(activeTab('/101')).toBeNull();
  });
  it('highlights no tab on other articles or settings', () => {
    expect(activeTab('/235')).toBeNull();
    expect(activeTab('/asetukset')).toBeNull();
    expect(activeTab('/suosikit')).toBeNull();
  });
});
