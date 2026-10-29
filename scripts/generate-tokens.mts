import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Reads design-system/tokens.json and writes src/theme/tokens.generated.ts.
 * The generated file is committed, so the generator must stay deterministic.
 *
 * Run with `npm run tokens` (plain Node, uses native TypeScript type-stripping).
 */

interface ThemeDef {
  id: string;
  name: string;
}

interface ColorValue {
  light: string;
  dark: string;
}

interface ColorToken {
  name: string;
  value: ColorValue | string;
  usage: string;
}

interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  letterSpacing?: string;
}

interface TypeGroup {
  name: string;
  family: string;
  styles: TypeStyle[];
}

interface NamedValue {
  name: string;
  value: string;
}

interface TokensJson {
  color: { themes: ThemeDef[]; tokens: ColorToken[] };
  type: { families: Record<string, string>; groups: TypeGroup[] };
  spacing: { tokens: NamedValue[] };
  radius: { tokens: NamedValue[] };
  size: { tokens: NamedValue[] };
}

// Bridge between the design system's single family + weights and the concrete
// font files bundled by @expo-google-fonts/schibsted-grotesk.
const FONT_FAMILY_BY_WEIGHT: Record<number, string> = {
  400: 'SchibstedGrotesk_400Regular',
  500: 'SchibstedGrotesk_500Medium',
  600: 'SchibstedGrotesk_600SemiBold',
  700: 'SchibstedGrotesk_700Bold',
  800: 'SchibstedGrotesk_800ExtraBold',
};

function px(value: string): number {
  if (!value.endsWith('px')) {
    throw new Error(`Expected a px value, got "${value}"`);
  }
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid px value "${value}"`);
  }
  return n;
}

function em(value: string): number {
  if (!value.endsWith('em')) {
    throw new Error(`Expected an em value, got "${value}"`);
  }
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid em value "${value}"`);
  }
  return n;
}

/** Round to two decimals, so letterSpacing is a clean px number. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function tsKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name}'`;
}

function tsString(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

/** Resolve colour tokens, following `{ref}` references (e.g. focus → link). */
function resolveColors(tokens: ColorToken[]): Record<string, ColorValue> {
  const byName = new Map(tokens.map((t) => [t.name, t]));
  const cache = new Map<string, ColorValue>();

  function resolve(name: string): ColorValue {
    const cached = cache.get(name);
    if (cached) return cached;
    const token = byName.get(name);
    if (!token) throw new Error(`Unknown colour token "${name}"`);
    const value = typeof token.value === 'string' ? resolve(token.value.slice(1, -1)) : token.value;
    cache.set(name, value);
    return value;
  }

  const out: Record<string, ColorValue> = {};
  for (const token of tokens) out[token.name] = resolve(token.name);
  return out;
}

function renderColors(tokens: ColorToken[]): string {
  const resolved = resolveColors(tokens);
  const light = tokens.map((t) => `    ${tsKey(t.name)}: ${tsString(resolved[t.name].light)},`);
  const dark = tokens.map((t) => `    ${tsKey(t.name)}: ${tsString(resolved[t.name].dark)},`);
  return [
    'export const colors = {',
    '  light: {',
    ...light,
    '  },',
    '  dark: {',
    ...dark,
    '  },',
    '} as const;',
  ].join('\n');
}

function renderType(tokens: TokensJson['type']): string {
  const familyLines = Object.entries(tokens.families).map(
    ([name, value]) => `    ${tsKey(name)}: ${tsString(value)},`,
  );

  const styles: string[] = [];
  for (const group of tokens.groups) {
    for (const style of group.styles) {
      const family = FONT_FAMILY_BY_WEIGHT[style.fontWeight];
      if (!family) {
        throw new Error(`No bundled font for weight ${style.fontWeight} (${style.name})`);
      }
      const parts = [
        `fontFamily: ${tsString(family)}`,
        `fontSize: ${px(style.fontSize)}`,
        `lineHeight: ${px(style.lineHeight)}`,
      ];
      if (style.letterSpacing !== undefined) {
        parts.push(`letterSpacing: ${round2(em(style.letterSpacing) * px(style.fontSize))}`);
      }
      styles.push(`    ${tsKey(style.name)}: { ${parts.join(', ')} },`);
    }
  }

  return [
    'export const type = {',
    '  families: {',
    ...familyLines,
    '  },',
    '  styles: {',
    ...styles,
    '  } satisfies Record<string, TextStyle>,',
    '} as const;',
  ].join('\n');
}

function renderNamed(exportName: string, tokens: NamedValue[]): string {
  const lines = tokens.map((t) => `  ${tsKey(t.name)}: ${px(t.value)},`);
  return [`export const ${exportName} = {`, ...lines, '} as const;'].join('\n');
}

export function generate(tokens: TokensJson): string {
  const header = [
    '// @generated by scripts/generate-tokens.mts — do not edit.',
    '// Source: design-system/tokens.json',
    '',
    "import type { TextStyle } from 'react-native';",
    '',
  ].join('\n');

  const themeIds = tokens.color.themes.map((t) => t.id).join("' | '");
  const body = [
    `export const themes = {`,
    ...tokens.color.themes.map((t) => `  ${tsKey(t.id)}: ${tsString(t.name)},`),
    `} as const;`,
    '',
    `export type ThemeId = '${themeIds}';`,
    '',
    renderColors(tokens.color.tokens),
    '',
    renderType(tokens.type),
    '',
    renderNamed('space', tokens.spacing.tokens),
    '',
    renderNamed('radius', tokens.radius.tokens),
    '',
    renderNamed('size', tokens.size.tokens),
    '',
  ].join('\n');

  return header + body;
}

function main(): void {
  const rootDir = fileURLToPath(new URL('..', import.meta.url));
  const tokensPath = resolve(rootDir, 'design-system', 'tokens.json');
  const outPath = resolve(rootDir, 'src', 'theme', 'tokens.generated.ts');

  const raw = readFileSync(tokensPath, 'utf8');
  const tokens = JSON.parse(raw) as TokensJson;

  const output = generate(tokens);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, output);
  console.log(`Wrote ${resolve(outPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
