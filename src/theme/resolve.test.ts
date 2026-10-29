import { describe, expect, it } from 'vitest';

import { resolveScheme } from './resolve';

describe('resolveScheme', () => {
  it('follows the phone when the choice is system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });

  it('ignores the phone when light or dark is chosen', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('dark', null)).toBe('dark');
  });
});
