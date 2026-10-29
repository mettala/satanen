import { describe, expect, it } from 'vitest';

import {
  fontScaleFromRoot,
  MAX_FONT_SCALE,
  MAX_TAB_LABEL_SCALE,
  scaleTextStyles,
  tabLabelScale,
} from './scale';

describe('fontScaleFromRoot', () => {
  it('is 1 at the browser default', () => {
    expect(fontScaleFromRoot(16)).toBe(1);
  });
  it('doubles at a 32 px root', () => {
    expect(fontScaleFromRoot(32)).toBe(2);
  });
  it('never shrinks below 1 and ignores nonsense', () => {
    expect(fontScaleFromRoot(10)).toBe(1);
    expect(fontScaleFromRoot(NaN)).toBe(1);
    expect(fontScaleFromRoot(undefined)).toBe(1);
    expect(fontScaleFromRoot(0)).toBe(1);
  });
  it('caps huge values', () => {
    expect(fontScaleFromRoot(200)).toBe(MAX_FONT_SCALE);
  });
});

describe('scaleTextStyles', () => {
  const styles = {
    a: { fontFamily: 'X', fontSize: 27, lineHeight: 30, letterSpacing: -0.4 },
    b: { fontSize: 12 },
  };
  it('returns the same object at scale 1', () => {
    expect(scaleTextStyles(styles, 1)).toBe(styles);
  });
  it('scales size, line height and letter spacing, keeps the rest', () => {
    const out = scaleTextStyles(styles, 2);
    expect(out.a).toEqual({ fontFamily: 'X', fontSize: 54, lineHeight: 60, letterSpacing: -0.8 });
    expect(out.b).toEqual({ fontSize: 24 });
  });
});

describe('tabLabelScale', () => {
  it('follows the text size up to the cap and never below 1', () => {
    expect(tabLabelScale(1)).toBe(1);
    expect(tabLabelScale(1.25)).toBe(1.25);
    expect(tabLabelScale(2)).toBe(MAX_TAB_LABEL_SCALE);
    expect(tabLabelScale(3)).toBe(1.5);
    expect(tabLabelScale(0.5)).toBe(1);
  });
  it('scales the tab style to the capped size at 200 %', () => {
    const out = scaleTextStyles({ tab: { fontSize: 12, lineHeight: 16 } }, tabLabelScale(2));
    expect(out.tab).toEqual({ fontSize: 18, lineHeight: 24 });
  });
});
