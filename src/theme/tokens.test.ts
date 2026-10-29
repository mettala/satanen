import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TextStyle } from 'react-native';

import { generate } from '../../scripts/generate-tokens.mts';
import { colors, themes, type as typeTokens } from './tokens.generated';

const here = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(here, '../..');
const tokens = JSON.parse(readFileSync(resolve(rootDir, 'design-system', 'tokens.json'), 'utf8'));

interface ResolvedColor {
  light: string;
  dark: string;
}

interface TypeStyle {
  name: string;
  fontSize: string;
  letterSpacing?: string;
}

function resolveRaw(name: string): ResolvedColor {
  const byName = new Map(tokens.color.tokens.map((t: { name: string }) => [t.name, t]));
  const cache = new Map<string, ResolvedColor>();

  function resolve(n: string): ResolvedColor {
    const cached = cache.get(n);
    if (cached) return cached;
    const token = byName.get(n) as { value: ResolvedColor | string };
    const value = typeof token.value === 'string' ? resolve(token.value.slice(1, -1)) : token.value;
    cache.set(n, value);
    return value;
  }

  return resolve(name);
}

describe('generated tokens', () => {
  it('exposes both themes', () => {
    expect(Object.keys(themes)).toEqual(['light', 'dark']);
  });

  it('every colour token is present for both themes with equal values', () => {
    const colorTokens = tokens.color.tokens as { name: string }[];
    for (const token of colorTokens) {
      const expected = resolveRaw(token.name);
      expect(colors.light[token.name as keyof typeof colors.light]).toBe(expected.light);
      expect(colors.dark[token.name as keyof typeof colors.dark]).toBe(expected.dark);
    }
  });

  it('type styles are plain TextStyle values (numeric letterSpacing, no fontWeight)', () => {
    for (const group of tokens.type.groups as { styles: TypeStyle[] }[]) {
      for (const style of group.styles) {
        const generated = typeTokens.styles[
          style.name as keyof typeof typeTokens.styles
        ] as TextStyle;
        expect(generated, `style ${style.name} exists`).toBeDefined();
        expect(generated, `style ${style.name} has no fontWeight`).not.toHaveProperty('fontWeight');
        if (style.letterSpacing !== undefined) {
          const em = Number.parseFloat(style.letterSpacing);
          const fontSize = Number.parseFloat(style.fontSize);
          const expected = Math.round(em * fontSize * 100) / 100;
          expect(generated.letterSpacing).toBe(expected);
        } else {
          expect(generated.letterSpacing).toBeUndefined();
        }
      }
    }
  });

  it('generator output is up to date', () => {
    const current = readFileSync(resolve(here, 'tokens.generated.ts'), 'utf8');
    expect(current).toBe(generate(tokens));
  });
});
