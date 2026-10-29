import { describe, expect, it } from 'vitest';

import { classify } from './route.mjs';

describe('classify', () => {
  it('treats script and asset paths as real files', () => {
    expect(classify('/_expo/static/js/web/entry-abc.js')).toBe('asset');
    expect(classify('/assets/logo.png')).toBe('asset');
  });
  it('sends everything else to the app', () => {
    expect(classify('/105')).toBe('app');
    expect(classify('/dev/states')).toBe('app');
    expect(classify('/assetsfoo')).toBe('app');
  });
});
