import { describe, expect, it } from 'vitest';

import { colors } from './tokens.generated';

/** WCAG 2 relative luminance of a `#RRGGBB` colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two `#RRGGBB` colours, 1 to 21. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Tokens used for text. Rule 6 in AGENTS.md: at least 4.5:1. */
const TEXT_TOKENS = [
  'ink',
  'ink-muted',
  'link',
  'section-news',
  'section-world',
  'section-business',
  'section-sport',
  'section-weather',
  'danger',
  'price-up',
  'price-down',
] as const;

describe('colour contrast', () => {
  it('measures known pairs like the WCAG formula', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const name of TEXT_TOKENS) {
      it(`${name} is at least 4.5:1 on bg and surface (${theme})`, () => {
        const c = colors[theme];
        expect(contrast(c[name], c.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c[name], c.surface)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
