/**
 * Joining wrapped teletext rows back into running text.
 *
 * Licence rule: these helpers only remove line breaks, spaces and the soft
 * hyphens Yle adds when it splits a word at the row's end. They never add,
 * drop or change a word. When unsure, a hyphen is kept: `auto-valmistaja`
 * reads fine, `lokahuhtikuu` (for `loka-huhtikuu`) would change the text.
 *
 * Every rule has a fixture test in blocks.test.ts.
 */
import { LINE_WIDTH } from './model';

const VOWELS = 'aeiouyåäö';

/** Words that follow a suspended hyphen: `talouskasvu- ja työllisyyslukemat` (163). */
const CONJUNCTIONS = new Set(['ja', 'tai', 'sekä', 'eli', 'och', 'eller', 'samt', 'and', 'or']);

/** Finnish month prefixes: `(loka-` + `huhtikuu)` on 410 is a real range. */
const MONTH = '(tammi|helmi|maalis|huhti|touko|kesä|heinä|elo|syys|loka|marras|joulu)';
const MONTH_PREFIX = new RegExp(`^${MONTH}$`, 'u');
const MONTH_WORD = new RegExp(`^${MONTH}kuu`, 'u');

/** Leading punctuation before a word: `(loka-`, `"auto-`. */
const LEADING_PUNCT = /^[("'«»”“‘’[]+/u;

export type HyphenJoin =
  /** Soft hyphen: drop it and join the halves (`neljännes-` + `vuosikatsaus`). */
  | 'soft'
  /** Real hyphen: keep it, no space (`Pohjois-` + `Pohjanmaalla`, `22.-` + `26.10.`). */
  | 'keep'
  /** Suspended hyphen before a conjunction: keep it and a space (`talouskasvu- ja`). */
  | 'keep-space';

/**
 * How to join a row ending in `-` to the next row. `before` is the last token
 * of the first row including the hyphen, `next` the first token of the next
 * row. Soft only when every check passes:
 *
 * - the part before the hyphen is 2+ lower-case letters with a vowel
 *   (`PHP-`, `30-`, `Ukraina-`, `tv-`, `s-` as in `s-posti` keep their hyphen),
 * - the next word starts with a lower-case letter (`Keski-` + `Suomen` keeps),
 * - the next word is not a conjunction (`talouskasvu- ja`),
 * - the same vowel does not meet across the break (`drooni-iskuja`,
 *   `linja-auto`: Finnish spelling needs the hyphen there),
 * - it is not a month range (`loka-` + `huhtikuu`).
 */
export function hyphenJoin(before: string, next: string): HyphenJoin {
  // Up to its last letter or digit. Not `replace(/[^\p{L}\d]+$/u, '')`: it
  // retries from every position of a long symbol run (quadratic).
  const nextWord = /^[\s\S]*[\p{L}\d]/u.exec(next)?.[0] ?? '';
  if (CONJUNCTIONS.has(nextWord.toLowerCase())) return 'keep-space';
  if (!before.endsWith('-')) return 'keep';
  const fragment = before.slice(0, -1).replace(LEADING_PUNCT, '');
  if (!/^\p{Ll}{2,}$/u.test(fragment)) return 'keep';
  if (![...fragment].some((c) => VOWELS.includes(c))) return 'keep';
  if (!/^\p{Ll}/u.test(next)) return 'keep';
  const last = fragment[fragment.length - 1];
  if (VOWELS.includes(last) && next[0] === last) return 'keep';
  if (MONTH_PREFIX.test(fragment) && MONTH_WORD.test(next)) return 'keep';
  return 'soft';
}

/**
 * Join `next` onto `prev` as one wrapped line: normally with a space; when
 * `prev` ends in a hyphen right after a character, by `hyphenJoin`; after an
 * en dash or a slash, with nothing. A hyphen after a space is a dash
 * (punctuation) and gets a space like any other word.
 */
export function joinWrapped(prev: string, next: string): string {
  if (prev === '') return next;
  if (next === '') return prev;
  if (/\S[-–]$/u.test(prev)) {
    if (prev.endsWith('–')) return prev + next;
    // The last word, found by scanning back to the last space. Not
    // `prev.search(/\S+$/)`: it retries from every letter of a long word,
    // and `prev` is the whole paragraph so far.
    let start = prev.length;
    while (start > 0 && !/\s/.test(prev[start - 1])) start--;
    const before = prev.slice(start);
    const join = hyphenJoin(before, next.split(/\s/)[0]);
    if (join === 'soft') return prev.slice(0, -1) + next;
    if (join === 'keep') return prev + next;
  }
  // `Helsinki/` + `Uusimaa` (199): a slash at the end joins without a space.
  if (/\S\/$/u.test(prev)) return prev + next;
  return `${prev} ${next}`;
}

/** Ends a sentence or a lead-in: a hard break after it starts a new paragraph. */
export function endsSentence(text: string): boolean {
  return /[.!?:;”"»)]$/u.test(text.trimEnd());
}

export interface RowShape {
  /** Column of the first non-space cell. */
  firstColumn: number;
  /** Column just after the last non-space cell. */
  endColumn: number;
  /** The row's text, trimmed. */
  text: string;
}

export function rowShape(text: string): RowShape {
  const firstColumn = text.search(/\S/);
  return { firstColumn, endColumn: text.trimEnd().length, text: text.trim() };
}

/**
 * True when `next` continues `prev` as a soft wrap (one paragraph line), false
 * when the editor broke the line on purpose:
 *
 * - `prev` ends in a word hyphen → always a wrap (`kulkeutumil-` + `la.` on 418).
 * - `next` is indented 2+ columns more than `prev` → a list or a new item
 *   (`  T  - tuhat` after `Sivuilla käytetään seuraavia lyhenteitä` on 175).
 * - otherwise a wrap only when `next`'s first word would not have fitted on
 *   `prev`'s row. Yle's editor leaves the last cells of a row empty: in the
 *   Finnish articles every wrapped row has at most 1 cell to spare
 *   (`Illalla sää selkenee lähes koko` + `maassa,` on 103 has 0), while
 *   deliberate breaks leave 3 or more (`Gammelstadsforsen` +
 *   `Gammelstadsforsens` on 725 has 3, `alternativet för forsen.` + `Nu` 12).
 * - a row starting with one capitalised word and a colon is a new field
 *   (`Ajankohta: …` / `Työaika: …` / `Puh: …` on 417), never a wrap.
 */
export function isSoftWrap(prev: RowShape, next: RowShape): boolean {
  if (/\S-$/u.test(prev.text)) return true;
  if (FIELD_START.test(next.text)) return false;
  if (next.firstColumn >= prev.firstColumn + 2) return false;
  const word = next.text.split(/\s/)[0];
  return LINE_WIDTH - (prev.endColumn + 1 + word.length) <= WRAP_SLACK;
}

/** `Työaika: ma-pe 06:00-21:00`, `Puh: 02002100`, `Sähköposti:`. */
const FIELD_START = /^\p{Lu}\p{Ll}+:(\s|$)/u;

/** Spare cells a wrapped row may still have (see `isSoftWrap`). */
export const WRAP_SLACK = 2;
