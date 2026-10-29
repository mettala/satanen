/**
 * Layer 3a of the parser: how much do we trust our reader-mode version?
 *
 * Pure functions over the output of `classify()`. For each subpage they add
 * up penalties from a few simple signals and return a score from 0 to 1.
 * When the score is too low, `fallback` is set and the subpage should be
 * shown as Yle's own page image (`/v1/teletext/images/{page}/{sub}.png`)
 * instead, so a reader never sees silently garbled content. Falling back is
 * always the safe choice: the image is exactly what a TV shows. Callers use
 * the `fallback` flags (see `assessPage`), never the score, to decide.
 *
 * Signals (reason codes are stable; `npm run parser-report` lists them):
 *
 *  - `empty`               nothing on the subpage at all
 *  - `graphics-heavy`      half or more of the rows were dropped as graphics or
 *                          mosaic art sent as text (420)
 *  - `few-readable-lines`  under a third of the rows hold a real word (420)
 *  - `uncertain-rules`     half or more of the rows were decided by a rule in
 *                          `UNCERTAIN_RULES`. Plain `text` rows only count when
 *                          they are set in columns: in an article every row is
 *                          `text`, and that is fine (420)
 *  - `mosaic-leak`         a shown row still holds mosaic codes (`j}|ij`):
 *                          visible garbage (890 row 5 when Yle's `all`
 *                          content cannot be used; with it, normalize marks
 *                          those cells as graphics, RP.8)
 *  - `symbol-run`          a shown row holds a ruler like `-----` next to real
 *                          text (500 rows 14 and 16)
 *  - `gapped-text`         many paragraph rows are really two columns that
 *                          reflowing would run together (299 subpage 2)
 *  - `nav-orphan-text`     a link row holds text that belongs to no link: the
 *                          wrapped end of an entry in the other column
 *                          (199 row 8 `hakemisto`)
 *  - `table-break`         a lone text row sits between table rows, so the
 *                          table is cut in two (419 row 10)
 *  - `heading-columns`     a double-height heading set in columns: a diagram,
 *                          not a title (419 row 4)
 *  - `oversized-row`       Yle sent text past the 40th column, which normalize
 *                          cut off the row (`Line.overflow`). Never seen in a
 *                          real page. Reader mode would hide the cut text, so
 *                          the subpage always falls back to Yle's image (PUB.11)
 *
 * Rules are deliberately simple. Each has a fixture test in
 * confidence.test.ts, and one test there pins the fallback set over every
 * fixture so any change in the verdicts shows up in review.
 */
import {
  hasWord,
  isPageRefGap,
  UNCERTAIN_RULES,
  type ClassifiedLine,
  type ClassifiedSubpage,
} from './classify';

export type ReasonCode =
  | 'empty'
  | 'graphics-heavy'
  | 'few-readable-lines'
  | 'uncertain-rules'
  | 'mosaic-leak'
  | 'symbol-run'
  | 'gapped-text'
  | 'nav-orphan-text'
  | 'table-break'
  | 'heading-columns'
  | 'oversized-row';

/** One signal that fired, with the rows behind it (for the parser report). */
export interface Signal {
  reason: ReasonCode;
  /** How much the signal took off the score. */
  penalty: number;
  /** Row numbers that triggered it. */
  rows: number[];
}

export interface Assessment {
  /**
   * 1 = reader mode is trustworthy, 0 = not at all. For reporting and sorting
   * only: decide what to show with `fallback`, never by comparing the score.
   */
  score: number;
  /** Below `LOW_CONFIDENCE_BELOW`: readable, but worth a look in the parser report. */
  lowConfidence: boolean;
  /** Show Yle's page image instead of reader mode. */
  fallback: boolean;
  /** Reason codes of the signals that fired, in a fixed order. */
  reasons: ReasonCode[];
}

export interface SubpageAssessment extends Assessment {
  number: number;
  signals: Signal[];
}

export interface PageAssessment extends Assessment {
  /**
   * One entry per subpage. When the page as a whole does not fall back, the
   * subpages with `fallback: true` are shown as images between reader-mode
   * subpages.
   */
  subpages: SubpageAssessment[];
}

/** Scores below this fall back to the page image. */
export const FALLBACK_BELOW = 0.6;
/** Scores below this are reported as low confidence. */
export const LOW_CONFIDENCE_BELOW = 0.8;

/** Penalties. A single "this shows garbage" signal is enough to fall back. */
const PENALTY = {
  'graphics-heavy': 0.5,
  'few-readable-lines': 0.3,
  'uncertain-rules': 0.2,
  'mosaic-leak': 0.5,
  'symbol-run': 0.15, // per row
  'gapped-text': 0.5,
  'nav-orphan-text': 0.1, // per row
  'table-break': 0.1, // per row
  'heading-columns': 0.15, // per row
  'oversized-row': 1,
} as const;
/** Signals whose penalty grows with the number of rows that trigger them. */
const PER_ROW: ReadonlySet<ReasonCode> = new Set<ReasonCode>([
  'symbol-run',
  'nav-orphan-text',
  'table-break',
  'heading-columns',
]);
/**
 * Combined cap for all per-row signals together. It keeps 1 - cap above
 * `FALLBACK_BELOW` with a margin, so a busy index (199, 500) can become low
 * confidence but never falls back on stray rows alone, however many there are.
 */
export const PER_ROW_CAP = 0.35;

const GRAPHICS_SHARE = 0.5;
const READABLE_SHARE = 1 / 3;
const UNCERTAIN_SHARE = 0.5;
const MIN_GAPPED_ROWS = 3;
const GAPPED_SHARE = 1 / 3;

/** A gap of 3+ spaces between two non-spaces: text set in columns. */
const COLUMN_GAP = /\S {3,}\S/;
/** Characters of mosaic codes sent as text; same set as classify's hasWord. */
const MOSAIC_CHAR = /[`~|{}^\\<>[\]]/g;
/** Four or more of the same symbol in a row: `----`, `....`, `====`. */
const SYMBOL_RUN = /([^\p{L}\d\s])\1{3,}/u;

/** A row with something on it, not counting row 1 and double-height copies. */
function isContent(l: ClassifiedLine): boolean {
  return (
    l.number > 1 && l.kind !== 'blank' && l.rule !== 'header-row' && l.rule !== 'double-height-copy'
  );
}

function isShown(l: ClassifiedLine): boolean {
  return l.kind !== 'drop' && l.kind !== 'blank';
}

/**
 * Rows decided on weak evidence. `text` is the catch-all, so it only counts
 * when the row is set in columns; prose rows are what `text` is for.
 */
function isUncertain(l: ClassifiedLine): boolean {
  if (!UNCERTAIN_RULES.includes(l.rule)) return false;
  return l.rule !== 'text' || COLUMN_GAP.test(l.text);
}

/**
 * A mosaic code sent as text: a token with two or more mosaic characters and
 * a letter (`j}|ij`, `0`~s+t`). Symbols that also occur in ordinary text do
 * not count: `>352` (TV guides: "see page 352"), `>>`, `[1]`.
 */
function hasMosaicCode(text: string): boolean {
  return text
    .split(/\s+/)
    .some((t) => (t.match(MOSAIC_CHAR) ?? []).length >= 2 && /\p{L}/u.test(t));
}

/**
 * Text on a link row that belongs to no link: what is left after blanking
 * every link and its label. `hakemisto` on 199 row 8 is the wrapped end of
 * `196-198 Aakkosellinen` in the right-hand column of the row above.
 */
function orphanText(l: ClassifiedLine): string {
  let rest = l.text;
  const blank = (from: number, to: number) => {
    rest = rest.slice(0, from) + ' '.repeat(to - from) + rest.slice(to);
  };
  for (const link of l.links) {
    blank(link.column, link.column + link.length);
    if (!link.label) continue;
    const end = link.column + link.length;
    const after = rest.indexOf(link.label, end);
    if (after >= 0 && rest.slice(end, after).trim().replace(/^,/, '') === '') {
      blank(after, after + link.label.length);
      continue;
    }
    // A page word may stand between a name and its link (`Otteluseuranta s. 241`).
    const before = rest.lastIndexOf(link.label, link.column);
    if (before >= 0 && isPageRefGap(rest.slice(before + link.label.length, link.column))) {
      blank(before, link.column);
    }
  }
  // Comma groups (`340,345-346`) leave commas behind; only words count.
  return hasWord(rest) ? rest.trim() : '';
}

/**
 * Index rows whose text does not all belong to a link. A `continuation` row
 * with a column gap carries the wrapped ends of both columns (199/2 row 16:
 * `ylihuomenna      Lisää ohjelmista`). Coloured bottom bars are skipped:
 * they mix links into a sentence (`TV1 huomenna 310  ylihuomenna 315`).
 */
function hasOrphanText(l: ClassifiedLine): boolean {
  if (l.kind !== 'nav' && l.kind !== 'headline') return false;
  if (l.rule === 'coloured-nav') return false;
  // Its shape accounts for every piece: names, numbers, a note, a wrapped end (`nameLinkRow`).
  if (l.rule === 'name-link') return false;
  if (l.rule === 'continuation') return COLUMN_GAP.test(l.text);
  return orphanText(l) !== '';
}

function perRow(reason: keyof typeof PENALTY, rows: number[]): Signal | undefined {
  if (rows.length === 0) return undefined;
  return { reason, penalty: rows.length * PENALTY[reason], rows };
}

/** Scale the per-row signals down together so their sum is at most `PER_ROW_CAP`. */
function capPerRow(found: Signal[]): Signal[] {
  const total = found.reduce((sum, s) => sum + (PER_ROW.has(s.reason) ? s.penalty : 0), 0);
  if (total <= PER_ROW_CAP) return found;
  const scale = PER_ROW_CAP / total;
  return found.map((s) =>
    PER_ROW.has(s.reason) ? { ...s, penalty: Math.round(s.penalty * scale * 1000) / 1000 } : s,
  );
}

function numbers(lines: ClassifiedLine[]): number[] {
  return lines.map((l) => l.number);
}

function signals(lines: ClassifiedLine[]): Signal[] {
  const content = lines.filter(isContent);
  if (content.length === 0) return [{ reason: 'empty', penalty: 1, rows: [] }];

  const shown = content.filter(isShown);
  const out: (Signal | undefined)[] = [];
  const share = (n: number) => n / content.length;

  const dropped = content.filter((l) => l.kind === 'drop');
  if (share(dropped.length) >= GRAPHICS_SHARE) {
    out.push({
      reason: 'graphics-heavy',
      penalty: PENALTY['graphics-heavy'],
      rows: numbers(dropped),
    });
  }

  const unreadable = content.filter((l) => !isShown(l) || !hasWord(l.text));
  if (share(content.length - unreadable.length) < READABLE_SHARE) {
    out.push({
      reason: 'few-readable-lines',
      penalty: PENALTY['few-readable-lines'],
      rows: numbers(unreadable),
    });
  }

  const uncertain = content.filter(isUncertain);
  if (share(uncertain.length) >= UNCERTAIN_SHARE) {
    out.push({
      reason: 'uncertain-rules',
      penalty: PENALTY['uncertain-rules'],
      rows: numbers(uncertain),
    });
  }

  const mosaic = shown.filter((l) => hasMosaicCode(l.text));
  if (mosaic.length > 0) {
    out.push({ reason: 'mosaic-leak', penalty: PENALTY['mosaic-leak'], rows: numbers(mosaic) });
  }

  out.push(perRow('symbol-run', numbers(shown.filter((l) => SYMBOL_RUN.test(l.text)))));

  const gapped = shown.filter((l) => l.kind === 'paragraph' && COLUMN_GAP.test(l.text));
  if (gapped.length >= MIN_GAPPED_ROWS && gapped.length >= shown.length * GAPPED_SHARE) {
    out.push({ reason: 'gapped-text', penalty: PENALTY['gapped-text'], rows: numbers(gapped) });
  }

  out.push(perRow('nav-orphan-text', numbers(shown.filter(hasOrphanText))));

  const byNumber = new Map(lines.map((l) => [l.number, l]));
  out.push(
    perRow(
      'table-break',
      numbers(
        shown.filter(
          (l) =>
            l.kind === 'paragraph' &&
            byNumber.get(l.number - 1)?.kind === 'table' &&
            byNumber.get(l.number + 1)?.kind === 'table',
        ),
      ),
    ),
  );

  out.push(
    perRow(
      'heading-columns',
      numbers(
        shown.filter((l) => l.kind === 'heading' && /\S\s{2,}\S.*\s{2,}\S/.test(l.text.trim())),
      ),
    ),
  );

  // Any row, row 1 included: its cut text would be lost from reader mode.
  const oversized = lines.filter((l) => l.line.overflow !== undefined);
  if (oversized.length > 0) {
    out.push({
      reason: 'oversized-row',
      penalty: PENALTY['oversized-row'],
      rows: numbers(oversized),
    });
  }

  return capPerRow(out.filter((s): s is Signal => s !== undefined));
}

function verdict(score: number): Pick<Assessment, 'score' | 'lowConfidence' | 'fallback'> {
  const rounded = Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
  return {
    score: rounded,
    lowConfidence: rounded < LOW_CONFIDENCE_BELOW,
    fallback: rounded < FALLBACK_BELOW,
  };
}

/** How far to trust reader mode for one classified subpage. */
export function assessSubpage(subpage: ClassifiedSubpage): SubpageAssessment {
  const found = signals(subpage.lines);
  const penalty = found.reduce((sum, s) => sum + s.penalty, 0);
  return {
    number: subpage.number,
    ...verdict(1 - penalty),
    reasons: found.map((s) => s.reason),
    signals: found,
  };
}

/**
 * Verdict for a whole page from `classify(page)`.
 *
 * Callers decide with `fallback`, not `score`: `fallback` on the page means
 * "show every subpage as an image"; otherwise show reader mode and swap in
 * the image only for subpages whose own `fallback` is true. The whole page
 * falls back when more than half of its subpages do. The page `score` is its
 * worst subpage's, so it can be very low on a page that does not fall back
 * (299: score 0.3 from subpage 2, but subpage 1 reads well).
 */
export function assessPage(subpages: readonly ClassifiedSubpage[]): PageAssessment {
  const assessed = subpages.map(assessSubpage);
  const worst = assessed.reduce((min, s) => Math.min(min, s.score), 1);
  const reasons = [...new Set(assessed.flatMap((s) => s.reasons))];
  const fallbackCount = assessed.filter((s) => s.fallback).length;
  return {
    score: worst,
    lowConfidence: worst < LOW_CONFIDENCE_BELOW,
    fallback: assessed.length > 0 && fallbackCount * 2 > assessed.length,
    reasons,
    subpages: assessed,
  };
}
