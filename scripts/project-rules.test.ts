/**
 * Machine checks for AGENTS.md rules 4 (design tokens), 5 (UI strings) and 6
 * (accessibility). They read the source with the TypeScript compiler API, so
 * comments and type names never cause false alarms. No extra dependency:
 * eslint-plugin-react-native-a11y only supports ESLint up to 8 (see D47).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function codeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return codeFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const rel = (file: string) => relative(ROOT, file).split('\\').join('/');
const all = [...codeFiles(join(ROOT, 'app')), ...codeFiles(join(ROOT, 'src'))].map((file) => ({
  path: rel(file),
  source: ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  ),
}));
type Scanned = (typeof all)[number];
const isDev = (p: string) => p.startsWith('app/dev/') || p.startsWith('src/dev/');
/** Generated tokens, and the i18n file itself, are where literals belong. */
const colourFiles = all.filter((f) => !f.path.startsWith('src/theme/') && !isDev(f.path));
/** Dev preview screens (not in the web build) show sample headlines, not UI text. */
const textFiles = all.filter((f) => !f.path.startsWith('src/i18n/') && !isDev(f.path));
const a11yFiles = all.filter((f) => !isDev(f.path));

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/**
 * Allowlists: `file` -> "<allowed count> reason". Keep them short and
 * justified; the count stops a file from quietly gaining more.
 */
const COLOUR_ALLOW: Record<string, string> = {};
const TEXT_ALLOW: Record<string, string> = {};
/** Known gaps in old code (warn level, see docs/BACKLOG.md); new code gets none. */
const A11Y_ALLOW: Record<string, string> = {};

function collect(
  files: Scanned[],
  allow: Record<string, string>,
  find: (sf: ts.SourceFile, node: ts.Node) => boolean,
): string[] {
  const problems: string[] = [];
  for (const f of files) {
    const hits: string[] = [];
    walk(f.source, (n) => {
      if (!find(f.source, n)) return;
      const { line } = f.source.getLineAndCharacterOfPosition(n.getStart(f.source));
      hits.push(`${f.path}:${line + 1}`);
    });
    const allowed = f.path in allow ? Number.parseInt(allow[f.path], 10) : 0;
    if (hits.length > allowed) problems.push(...hits);
  }
  return problems;
}

/** Parse a snippet and run a checker over it: how the guards themselves are tested. */
function probe(code: string, find: (sf: ts.SourceFile, node: ts.Node) => boolean): number {
  const sf = ts.createSourceFile(
    'probe.tsx',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let hits = 0;
  walk(sf, (n) => {
    if (find(sf, n)) hits += 1;
  });
  return hits;
}

// A whole value that is a hex colour (#rgb, #rgba, #rrggbb, #rrggbbaa), or an rgb()/rgba()/hsl()/hsla() call.
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /\b(?:rgba?|hsla?)\s*\(/i;

const isColourHit = (_sf: ts.SourceFile, n: ts.Node): boolean =>
  (ts.isStringLiteralLike(n) ||
    ts.isTemplateHead(n) ||
    ts.isTemplateMiddle(n) ||
    ts.isTemplateTail(n)) &&
  (HEX.test(n.text.trim()) || FUNC.test(n.text));

describe('rule 4: colours come from tokens', () => {
  it('scans the source tree', () => {
    expect(colourFiles.length).toBeGreaterThan(30);
  });

  it('has no hex, rgb() or hsl() colour literals outside src/theme and dev code', () => {
    expect(collect(colourFiles, COLOUR_ALLOW, isColourHit)).toEqual([]);
  });

  it('the guard flags real colours and not look-alikes', () => {
    expect(probe("const a = '#ff0000';", isColourHit)).toBe(1);
    expect(probe("const a = '#FFF';", isColourHit)).toBe(1);
    expect(probe("const a = '#ff000080';", isColourHit)).toBe(1);
    expect(probe('const a = `rgba(0, 0, 0, ${o})`;', isColourHit)).toBe(1);
    expect(probe("const a = 'hsl(10 20% 30%)';", isColourHit)).toBe(1);
    expect(probe("const a = '#fff8';", isColourHit)).toBe(1);
    expect(probe("const a = '#FEED';", isColourHit)).toBe(1);
    expect(probe("const a = '#ffffff80';", isColourHit)).toBe(1);
    expect(probe("const a = 'https://x.io/#feed';", isColourHit)).toBe(0);
    expect(probe("const a = '#';", isColourHit)).toBe(0);
    expect(probe("const a = 'hello';", isColourHit)).toBe(0);
    expect(probe("const a = 'see#abc';", isColourHit)).toBe(0);
    expect(probe("const a = '&#123;';", isColourHit)).toBe(0);
  });
});

const TEXT_ATTRS = new Set([
  'accessibilityLabel',
  'accessibilityHint',
  'aria-label',
  'title',
  'placeholder',
  'alt',
]);
const hasLetters = (s: string) => /[\p{L}\p{N}]/u.test(s);
const TEXT_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.PlusToken,
]);

/**
 * True when the expression can produce a string literal with a letter or digit:
 * plain and template strings (head, spans), both branches of `?:`, `??`, `||`,
 * `&&`, `+`, and through parentheses, `as`, `satisfies` and `!`. Calls and
 * identifiers (`t.x`, `t.x(n)`) are fine.
 */
function literalText(e: ts.Expression): boolean {
  if (ts.isStringLiteralLike(e)) return hasLetters(e.text);
  if (ts.isTemplateExpression(e)) {
    return (
      hasLetters(e.head.text) ||
      e.templateSpans.some((s) => hasLetters(s.literal.text) || literalText(s.expression))
    );
  }
  if (ts.isConditionalExpression(e)) return literalText(e.whenTrue) || literalText(e.whenFalse);
  if (ts.isBinaryExpression(e) && TEXT_OPERATORS.has(e.operatorToken.kind)) {
    return literalText(e.left) || literalText(e.right);
  }
  if (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isSatisfiesExpression(e)
  ) {
    return literalText(e.expression);
  }
  return false;
}

/** Other attributes (testID, key, href, name, style, ...) are never checked. */
const isTextHit = (sf: ts.SourceFile, n: ts.Node): boolean => {
  if (ts.isJsxText(n)) return hasLetters(n.text);
  if (ts.isJsxAttribute(n) && TEXT_ATTRS.has(n.name.getText(sf)) && n.initializer) {
    const init = n.initializer;
    if (ts.isStringLiteral(init)) return hasLetters(init.text);
    return ts.isJsxExpression(init) && !!init.expression && literalText(init.expression);
  }
  return (
    ts.isJsxExpression(n) &&
    (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent)) &&
    !!n.expression &&
    literalText(n.expression)
  );
};

describe('rule 5: UI text comes from src/i18n', () => {
  it('has no hard-coded JSX text or label props', () => {
    expect(collect(textFiles, TEXT_ALLOW, isTextHit)).toEqual([]);
  });

  it('the guard flags hard-coded text in every shape and spares i18n reads', () => {
    const flagged = [
      '<Text>Terve</Text>',
      "<Text>{'Terve'}</Text>",
      '<Text>{`Terve ${n}`}</Text>',
      '<Text>{`${n} kpl`}</Text>',
      "<Text>{n ? 'Kyllä' : 'Ei'}</Text>",
      "<Text>{n ? t.a : 'Ei'}</Text>",
      "<Text>{(n ?? 'Ei') as string}</Text>",
      "<Text>{n || 'Ei'}</Text>",
      "<Text>{n && 'Kyllä'}</Text>",
      "<Text>{'Sivu ' + n}</Text>",
      "<Text>{(n ? 'a' : 'b')!}</Text>",
      '<View accessibilityLabel="Sulje" />',
      '<View accessibilityLabel={`Sivu ${n}`} />',
      "<View accessibilityHint={n ? 'Auki' : t.x} />",
      "<TextInput placeholder={'Hae'} />",
      '<Button title="Tallenna" />',
      "<View aria-label={n + ' sivua'} />",
    ];
    for (const code of flagged) {
      expect(probe(`const x = ${code};`, isTextHit), code).toBeGreaterThan(0);
    }
    const fine = [
      '<Text>{t.x}</Text>',
      '<Text>{t.x(n)}</Text>',
      '<Text>   </Text>',
      "<Text>{' '}</Text>",
      '<Text>{n ? t.a : t.b}</Text>',
      '<View accessibilityLabel={t.x} />',
      '<View accessibilityLabel={t.x(n)} />',
      '<View testID="page-list" key="abc" href="/105" name="menu" style={{ flex: 1 }} />',
      '<View testID={`row-${n}`} />',
    ];
    for (const code of fine) {
      expect(probe(`const x = ${code};`, isTextHit), code).toBe(0);
    }
  });

  it('keeps the top section titles in the i18n file', () => {
    const sections = all.filter((f) => f.path === 'src/sections/sections.ts');
    expect(sections).toHaveLength(1);
    const problems = collect(
      sections,
      {},
      (sf, n) =>
        ts.isPropertyAssignment(n) &&
        n.name.getText(sf) === 'title' &&
        ts.isStringLiteralLike(n.initializer),
    );
    expect(problems).toEqual([]);
  });
});

const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'Button']);
const ROLE = ['accessibilityRole', 'role'];
const LABEL = ['accessibilityLabel', 'aria-label'];

/**
 * A tappable element needs a role and a label. A JSX spread does not
 * count as a role or label: they must be explicit props, or the element needs an
 * allowlist entry.
 */
const isA11yHit = (sf: ts.SourceFile, n: ts.Node): boolean => {
  if (!ts.isJsxOpeningLikeElement(n)) return false;
  const tag = n.tagName.getText(sf);
  if (!PRESSABLES.has(tag)) return false;
  const props = n.attributes.properties;
  const names = new Set(props.filter(ts.isJsxAttribute).map((p) => p.name.getText(sf)));
  const isButton = tag === 'Button';
  const hasRole = isButton || ROLE.some((r) => names.has(r));
  const hasLabel = LABEL.some((l) => names.has(l)) || (isButton && names.has('title'));
  return !(hasRole && hasLabel);
};

describe('rule 6: tappable things have a role and a label', () => {
  it('every Pressable/Touchable/Button has a role and an accessible label', () => {
    expect(collect(a11yFiles, A11Y_ALLOW, isA11yHit)).toEqual([]);
  });

  it('the guard flags missing role, missing label and spreads', () => {
    expect(probe('const x = <Pressable onPress={f} />;', isA11yHit)).toBe(1);
    expect(probe("const x = <Pressable accessibilityRole='button' />;", isA11yHit)).toBe(1);
    expect(probe('const x = <Pressable accessibilityLabel={t.x} />;', isA11yHit)).toBe(1);
    expect(probe('const x = <Pressable {...props} />;', isA11yHit)).toBe(1);
    expect(probe("const x = <Pressable {...p} accessibilityRole='button' />;", isA11yHit)).toBe(1);
    expect(
      probe(
        "const x = <Pressable {...p} accessibilityRole='button' accessibilityLabel={t.x} />;",
        isA11yHit,
      ),
    ).toBe(0);
    expect(probe('const x = <Button onPress={f} />;', isA11yHit)).toBe(1);
    expect(
      probe(
        "const x = <Pressable accessibilityRole='button' accessibilityLabel={t.x} />;",
        isA11yHit,
      ),
    ).toBe(0);
    expect(probe('const x = <Pressable role="link" aria-label={t.x} />;', isA11yHit)).toBe(0);
    expect(probe('const x = <Button title={t.x} />;', isA11yHit)).toBe(0);
  });
});
