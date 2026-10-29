/**
 * Layer 2 of the parser: decide what each normalised line is.
 *
 * Pure function over the `Page` model from `normalize()`. It never edits
 * text: it only blanks out decoration cells (mosaic graphics, DEL blocks) in
 * `text` and labels each row. Later steps build reader blocks from the labels
 * (M1.4 paragraphs and lists, M1.5 tables, confidence and PNG fallback).
 *
 * Every classification carries the id of the rule that made it, so a page
 * that reads badly can be traced back to one rule, and M1.5 can score
 * confidence from the mix of rules used. Each rule has a fixture test in
 * classify.test.ts. Rules are deliberately simple; when unsure, a row ends up
 * as `paragraph` (shown as plain text) rather than being dropped.
 *
 * First pass, per row; the first matching rule wins:
 *
 *  1. `header-row`         drop      row 1 (section name, weekday, `1/3`)
 *  2. `double-height-copy` drop      the text-less second half of a double-height row
 *  3. `graphics-only`      drop      nothing left once graphics / DEL cells are blanked
 *     `blank`              blank     nothing on the row at all
 *  4. `title-row`          title     rows 2–4 joined to row 1 by graphics or a coloured
 *                                    background: page title, TV-guide day, weather issue
 *                                    time. Rows there with no word or number (logo pieces)
 *                                    are `drop`. Rows holding links or table columns are
 *                                    classified normally.
 *  5. `decoration-text`    drop      symbols but no word, number or link: `-----`,
 *                                    `.....`, mosaic codes sent as plain text (`ppsss3##`)
 *  6. `coloured-nav`       nav       coloured background with named links (bottom bars)
 *     `name-link`          nav       an index entry with its name first: `Aikataulut 400`,
 *                                    `DIGITA tiedottaa 577, 582, 588`, `Säätiedotus 401, 5 vrk
 *                                    ennuste 405` (the alphabetical index 196-198). Only on a
 *                                    subpage with 3+ such rows, so an article row ending in a
 *                                    number (`Paikasta Hujansalo 100` on 417) stays text. See
 *                                    `nameLinkRow`.
 *     `page-ref`           nav       nothing but page references, a capitalised name, a page
 *                                    word and a link: `Otteluseuranta s. 241`, `M-S sivu 197,
 *                                    T-Y sivu 198`
 *  7. `running-text`       paragraph page links inside a sentence: the row starts with a
 *                                    lower-case word before its first link and has no
 *                                    wide gap (`urallaan 120 NHL-ottelua ja 126 AHL-` on
 *                                    202: game counts, not pages). Checked before the
 *                                    link rules below; double-height text stays a heading.
 *     `link-title`         headline  one page link at the left edge, then a capitalised title
 *     `link-columns`       nav       two or more named links, or a named link followed by a
 *                                    second column (index pages)
 *     `link-column`        nav       a named link standing in a right-hand column, or
 *                                    `Name   400` with the link at the row's end
 *     `link-only`          nav       nothing but links (`196-198`, `yle.fi/uutiset`)
 *  8. `double-height`      heading   double-height text
 *  9. `match-row`          table     `Home - Away   1-0` or `… 18.30`
 *     `columns`            table     two or more wide gaps (standings, weather, F1 winners)
 *     `number-column`      table     a wide gap and then a number at the end (`87,50%`)
 *     `time-row`           table     starts with a time (`22.50 …`), when 3+ such rows are
 *                                    on the subpage (TV guides)
 * 10. `text`               paragraph everything else
 *
 * Before the first pass, per row (they change what the rules above see):
 *
 *  - `next-hint`: a "next subpage" hint at the row's end, `Huomenna klo 00-12 >>`
 *    on 189, is blanked when its words begin a row of another subpage (reader
 *    mode shows that subpage below anyway). See `nextHint`.
 *  - page-reference names: a link with a page word before it (`s.`, `sivu`,
 *    `sivulla`, `sid.`, `på s.`) is named by the words before the page word,
 *    not by the text after it: `selitteet s.419` (408) → `selitteet`. See
 *    `pageRefLabel`.
 *
 * Second pass, rows that only make sense next to their neighbours (in this
 * order; `table-caption` and `band-header` run after the others):
 *
 *  - `continuation`: a `text` or `running-text` row indented further than the
 *    headline, nav or TV-guide `time-row` right above it takes that row's kind
 *    (wrapped index entries, wrapped TV programme names; 400's
 *    `tänään & 3 vrk (selitteet 419)` under `406-407 Sää paikkakunnittain:`).
 *  - `table-neighbour`: a `text` row right next to a table row that has a
 *    wide gap or is mostly numbers is part of that table.
 *  - `table-date`: a date-only row (`23.10.`, `la 24.10.`) right above a table
 *    row belongs to the table.
 *  - `table-note`: a `text` row that is only a bracketed note, `(Koivunen)`,
 *    or one token holding a digit and then the note, `Nugent-Hopkins24 (Aho)`,
 *    right next to a table row is part of that table (assists under a goal
 *    scorer on 235). Joins up like `table-neighbour`.
 *  - `table-header`: a `text` row with a wide gap, whose next non-blank row is a
 *    table row with a column starting exactly under one of its words, is that
 *    table's column header (`Voittaja    Bottas` above the F1 winners on 298).
 *    It stays in the table so the monospace columns line up.
 *  - `coloured-title`: a coloured row with one page link at its start and a
 *    name after it, `592 Puolustusvoimien ampumatiedotteet` on 400, is a
 *    `headline` like the `link-title` rows of the subpage's list, not a bar,
 *    when the subpage has such a list. Bars hold several links or put the
 *    name first (`Ajatus päivälle   895` on 100).
 *  - `board-arrow`: `drop`; a name and an arrow, `Turku   >>>`, on a subpage with
 *    3+ time rows points to the next airport board on 425 and says nothing by itself. The arrow is
 *    sometimes a `>>>` link and sometimes plain text.
 *  - `table-caption`: `heading`; a `text` row right above a table row (no blank
 *    between) that starts with a capital, does not end in a full stop, and does
 *    not continue a sentence from the row above: `Huomenna klo 00-12 (hinta
 *    15min välein)` over the price table on 189, `MERIVEDEN KORKEUS (teoreett.
 *    keskivesi)` on 404. Only above a table row decided by its own columns
 *    (`TABLE_START_RULES`), not one that joined a table from its neighbours.
 *  - `band-header`: `table`; a row of the coloured header band (rows 2-4) right
 *    above a table whose pieces are column labels: mostly capitals, no number
 *    or date, and at least one piece starting or ending in the same column as
 *    a piece of the table below, give or take one (`OSUUDEN    MUUTOS  MUUTOS` and `ARVO PV
 *    %EDELL   %12KK` on 181-187). A piece at the row's left edge is the page
 *    title instead and goes to `title` (`OMXH Large Cap` on 176, `rahastot` on
 *    187, which wraps `Vaihtoehtoiset ja kiinteistö-` from the row above).
 *    Checked from the bottom up, so the second header row counts as table too.
 */
import type { Line, Page, Run } from './model';
import { endsSentence } from './reflow';

export type LineKind =
  'drop' | 'blank' | 'title' | 'headline' | 'heading' | 'nav' | 'table' | 'paragraph';

export type RuleId =
  | 'header-row'
  | 'double-height-copy'
  | 'graphics-only'
  | 'blank'
  | 'title-row'
  | 'decoration-text'
  | 'coloured-nav'
  | 'name-link'
  | 'page-ref'
  | 'running-text'
  | 'link-title'
  | 'link-columns'
  | 'link-column'
  | 'link-only'
  | 'double-height'
  | 'match-row'
  | 'columns'
  | 'number-column'
  | 'time-row'
  | 'text'
  | 'continuation'
  | 'table-neighbour'
  | 'table-date'
  | 'table-note'
  | 'table-header'
  | 'coloured-title'
  | 'table-caption'
  | 'band-header'
  | 'board-arrow';

/** Where a link goes in reader mode. Ranges come from `400`, `-`, `409`. */
export type ReaderLink =
  | { kind: 'page'; page: number }
  | { kind: 'range'; from: number; to: number }
  | { kind: 'url'; href: string };

export interface LinkSpan {
  target: ReaderLink;
  /** On-screen text of the link, e.g. `"406-408"` or `"196 - 198"`. */
  text: string;
  /** 0-based column of the first cell, and number of cells covered. */
  column: number;
  length: number;
  /**
   * Words naming the link: the text after it up to a wide gap or the next
   * link, or else the text before it (`Aakkosellinen hakemisto 196-198`).
   * Only meaningful on headline and nav rows; `""` when there is none.
   */
  label: string;
  /**
   * True when a page word stands right before the link and `label` is the
   * words before that (`Keskihinnat s.188` → `Keskihinnat`). On a link row the
   * page word is then left out: the link itself says "page".
   */
  pageRef?: true;
}

export interface ClassifiedLine {
  /** Row number, 1..24. */
  number: number;
  kind: LineKind;
  /** The rule that decided `kind` (see the list at the top of this file). */
  rule: RuleId;
  /**
   * The row as on screen, with decoration cells (graphics runs, runs holding
   * DEL, the `>>>` marker) replaced by spaces. Columns are unchanged, as long
   * as every run's `Text` matched its `length` (true for every fixture; a
   * longer `Text` is kept by normalize up to the row's 40 columns and shifts
   * the cells after it).
   */
  text: string;
  /**
   * Links in column order: ranges merged, links on graphics dropped. On
   * table rows these are often not real links: Yle's link detector marks any
   * 3-digit number (points `340` on 298, scores `185-127` on 260).
   */
  links: LinkSpan[];
  /** The normalised line, for anything this layer did not keep. */
  line: Line;
  /**
   * Only on a `band-header` row that also holds the page title at its left
   * edge (`OMXH Large Cap  AIKA VAIHTO/e MUUTOS%` on 176): the title piece,
   * trimmed. Its cells are blanked in `text`, which keeps the column labels.
   */
  title?: string;
}

export interface ClassifiedSubpage {
  number: number;
  lines: ClassifiedLine[];
}

/**
 * Rules that guess from weak evidence or from neighbouring rows. A page with
 * many rows decided by these is a candidate for the PNG fallback (M1.5).
 */
export const UNCERTAIN_RULES: readonly RuleId[] = [
  'text',
  'continuation',
  'table-neighbour',
  'table-note',
  'decoration-text',
  'number-column',
];

/** DEL (0x7F): a solid block on screen, never a letter. */
const DEL = '\x7f';

/**
 * Decoration: graphics runs, and any run holding a DEL block. Page 420 sends
 * mosaic art in plain-colour runs (Yle's `all` content shows they are in
 * graphics mode, `structured` loses it). normalize now finds those cells from
 * `all` (RP.8); DEL stays a safety net for when `all` cannot be used.
 * Concealed cells are hidden on a TV until "reveal" is pressed, so they are
 * blanked too: the stray `sn` on the fund pages 181-187 (RP.9).
 */
export function isDecorationRun(run: Run): boolean {
  return run.graphics || run.concealed === true || run.text.includes(DEL);
}

/**
 * `>>>` (link value `">>>"`) is the TV's "continues on the next subpage"
 * arrow: on 199 it is on subpages 2 and 3 and not on the last subpage 4.
 * Reader mode joins subpages, so it is blanked and not kept as a link.
 */
function isNextSubpageMarker(run: Run): boolean {
  return run.link?.kind === 'other' && run.link.raw === '>>>';
}

const VOWEL = /[aeiouyåäöæøéüAEIOUYÅÄÖÆØÉÜ]/;
/**
 * Characters that show up in mosaic codes sent as text but not inside words.
 * `#`, `$` and `_` are left out so `#MeToo` or `$100`-style tokens still count.
 */
const MOSAIC_CHAR = /[`~|{}^\\<>[\]]/;

/**
 * True when the text has a real word: a space-separated token without mosaic
 * characters that has 2+ letters in a row with a vowel, and no letter three
 * times in a row. Mosaic codes sent as text (`ppsssssss`, `prss`, `j}|ij`) fail.
 */
export function hasWord(text: string): boolean {
  return text.split(/\s+/).some((t) => {
    if (MOSAIC_CHAR.test(t)) return false;
    return (t.match(/\p{L}{2,}/gu) ?? []).some((w) => VOWEL.test(w) && !/(\p{L})\1\1/u.test(w));
  });
}

/** True when a token is a number, date, time, score or range: `12.00`, `(23-21,`, `55-`. */
function hasNumber(text: string): boolean {
  return text.split(/\s+/).some((t) => /^[([]?[-+]?\d[\d.,:\-+/%=)\]]*$/.test(t));
}

/** Two letters in a row: enough to name a link (`TV2`, `Sub`, `OMXH`). */
function hasLetters(text: string): boolean {
  return /\p{L}{2}/u.test(text);
}

/** Starts like a title or index name, not like the middle of a sentence. */
const CAPITALISED = /^[\p{Lu}\d"'«(]/u;

function spaces(n: number): string {
  return ' '.repeat(n);
}

/** Text after a link up to the next link, cut at a wide (3+ space) gap. */
function labelAfter(rest: string): { label: string; remainder: string } {
  if (/^\s{3,}/.test(rest) || rest.trim() === '') return { label: '', remainder: rest.trim() };
  const parts = rest.trim().split(/\s{3,}/);
  return { label: parts[0], remainder: parts.slice(1).join(' ') };
}

/** Text before a link back to the previous link: its last column only. */
function labelBefore(before: string): string {
  const parts = before.trimEnd().split(/\s{3,}/);
  return parts[parts.length - 1].trim();
}

/**
 * A page word that says "the number after me is a page": `s.`, `sivu`,
 * `sivulla`, `sivuilla`, `sivulle`, `sivuille`, Swedish `sid.`, `sidan`,
 * `sidorna`, with an optional `på` (`index på s.  799` on 196). `sivut` is
 * left out: `DX-kuuntelijoiden sivut 591` (196) is the name of the pages.
 */
const PAGE_REF_WORD = String.raw`(?:på\s+)?(?:s\.|sivu(?:lla|illa|lle|ille)?|sid\.|sidan|sidorna)`;
/**
 * The text before a link ends in a page word and at most two spaces
 * (`Keskihinnat s.`, `M-S sivu `). A wider gap ends a column instead:
 * `579 Valkoinen sivu   572 Keltainen sivu` (575) names 579, not 572.
 */
const PAGE_REF_BEFORE = new RegExp(String.raw`(?:^|[^\p{L}])${PAGE_REF_WORD}\s{0,2}$`, 'iu');
/** Nothing but spaces and one page word: what may stand between a label and its link. */
const PAGE_REF_GAP = new RegExp(String.raw`^\s*(?:${PAGE_REF_WORD}\s*)?$`, 'iu');

/**
 * True when `gap`, the text between a link's label and the link, is only
 * spaces or a page word (`Ajatus päivälle s. 895`: the gap is ` s. `).
 * blocks.ts and confidence.ts use it to find a `page-ref` label.
 */
export function isPageRefGap(gap: string): boolean {
  return PAGE_REF_GAP.test(gap);
}

/**
 * Rule `page-ref` (label part): when the text before a page link ends in a
 * page word, the link is a page reference and its name is the words before
 * the page word, back to a wide (2+ space) gap: `25.10. klo 21.30  selitteet
 * s.419` (408) → `selitteet`, `M-S sivu 197, T-Y sivu 198` (196) → `M-S` and
 * `T-Y`. Leading `,` `;` `&` are left out. Undefined when there are no words
 * (`Sivulla 408 Eurooppa & muu maailma` on 419 keeps its name after the link).
 */
function pageRefLabel(before: string): string | undefined {
  const m = PAGE_REF_BEFORE.exec(before);
  if (!m) return undefined;
  const start = /^\p{L}/u.test(m[0]) ? m.index : m.index + 1;
  const columns = before
    .slice(0, start)
    .trimEnd()
    .split(/\s{2,}/);
  const label = columns[columns.length - 1].replace(/^[\s,;&]+/, '').trim();
  // A letter is enough: `M-S` and `T-Y` (letter ranges of the index) are names.
  return /\p{L}/u.test(label) ? label : undefined;
}

function toReaderLink(run: Run): ReaderLink | undefined {
  const l = run.link;
  if (l?.kind === 'page') return { kind: 'page', page: l.page };
  if (l?.kind === 'url') return { kind: 'url', href: l.href };
  return undefined;
}

function sameTarget(a: ReaderLink, b: ReaderLink): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A link before it is named. */
export type RawLink = Omit<LinkSpan, 'label'>;

/**
 * A page link that is really part of a number. Yle marks every 3-digit number
 * as a link, also inside `-439,32` or `62 734,60` (174): the digits are
 * followed by a decimal part of one or two digits. Comma-joined links
 * (`582,588`) have three digits after the comma and stay links.
 */
function isNumberFragment(runs: Run[], i: number): boolean {
  const run = runs[i];
  if (run.link?.kind !== 'page' || !/^\d{3}$/.test(run.text)) return false;
  const after = runs.slice(i + 1).reduce((s, r) => s + r.text, '');
  return /^[,.]\d{1,2}(?!\d)/.test(after);
}

/**
 * Collect the row's links. Links on decoration runs are dropped (890 row 2
 * has digit links inside mosaic art). `400`, `-`, `409` (also ` - `) becomes
 * one range when the second number is larger (`185-127` on 260 is a score).
 */
function collectLinks(runs: Run[], decoration: boolean[]): RawLink[] {
  const out: RawLink[] = [];
  for (let i = 0; i < runs.length; i++) {
    if (decoration[i] || isNumberFragment(runs, i)) continue;
    const run = runs[i];
    const target = toReaderLink(run);
    if (!target) continue;

    const prev = out[out.length - 1];
    if (prev && prev.column + prev.length === run.column && sameTarget(prev.target, target)) {
      // One link split over adjacent runs.
      prev.text += run.text;
      prev.length += run.length;
      continue;
    }

    const dash = runs[i + 1];
    const next = runs[i + 2];
    const nextTarget = next && !decoration[i + 2] ? toReaderLink(next) : undefined;
    if (
      target.kind === 'page' &&
      dash &&
      !dash.link &&
      !decoration[i + 1] &&
      /^ ?- ?$/.test(dash.text) &&
      nextTarget?.kind === 'page' &&
      nextTarget.page > target.page
    ) {
      out.push({
        target: { kind: 'range', from: target.page, to: nextTarget.page },
        text: run.text + dash.text + next.text,
        column: run.column,
        length: next.column + next.length - run.column,
      });
      i += 2;
      continue;
    }
    out.push({ target, text: run.text, column: run.column, length: run.length });
  }
  return out;
}

interface Features {
  line: Line;
  text: string;
  links: LinkSpan[];
  /**
   * One entry per link, or per comma group of links (`582,588 Lähetys-info`):
   * the name after it, and any text after a following wide gap.
   */
  entries: { label: string; remainder: string }[];
  /** Per link: the text between it and the previous link (or the row's start). */
  before: string[];
  /** Some decoration cell is not blank. */
  hasDecoration: boolean;
  /** Some run has a coloured (non-black) background. */
  hasColouredBg: boolean;
  /** Real text sits on a coloured background. */
  colouredText: boolean;
  doubleHeightText: boolean;
  doubleHeightCopy: boolean;
  /** A name followed by `>>>` and nothing else (`Turku   >>>`). */
  arrow: boolean;
  /** Column of the first non-space cell, -1 when blank. */
  firstColumn: number;
}

/**
 * An airport board row: `05:25 Riika      BT358`, `16:10 Mancheste AY1365 Sulj  200`
 * (425-427). Yle marks the digits of the flight number and the number at the
 * row's end as page links, but none of them goes anywhere useful.
 */
const FLIGHT_ROW = /^\s*\d{2}:\d{2}\s+.*\b[A-Z][A-Z0-9]\d{2,5}\b/;

/** `Turku   >>>`: one name, then the arrow. */
const BOARD_ARROW = /^\s*\p{L}[\p{L} .\/-]*?\s+>>>\s*$/u;

/** A row ending in a teletext arrow `>`, `>>` or `>>>` (after its trailing spaces). */
const TRAILING_ARROW = /\s>{1,3}$/;

/**
 * Rule `next-hint`: `Huomenna klo 00-12 >>` at the end of a row (189) tells a
 * TV viewer what the next subpage holds. Reader mode shows every subpage, so
 * the hint is blanked, arrow and words, when its words begin a row of another
 * subpage of the page (189/3 row 4: `Huomenna klo 00-12 (hinta 15min välein)`).
 * The words are the text after the row's last link, or after a wide gap.
 * Anything else ending in an arrow is kept. Returns the columns to blank.
 */
function nextHint(
  text: string,
  links: readonly RawLink[],
  otherRows: readonly string[],
): { from: number; to: number } | undefined {
  const t = text.trimEnd();
  if (otherRows.length === 0 || !TRAILING_ARROW.test(t)) return undefined;
  let arrow = t.length;
  while (arrow > 0 && t[arrow - 1] === '>') arrow--;
  const last = links.at(-1);
  const linkEnd = last ? last.column + last.length : 0;
  const tail = t.slice(linkEnd, arrow);
  const gap = tail.trimEnd().lastIndexOf('  ');
  const from = linkEnd + (gap >= 0 ? gap : 0);
  const words = t.slice(from, arrow).trim();
  if (!hasLetters(words) || !otherRows.some((r) => r.startsWith(words))) return undefined;
  return { from, to: t.length };
}

function features(line: Line, otherRows: readonly string[] = []): Features {
  const decoration = line.runs.map((r) => isDecorationRun(r) || isNextSubpageMarker(r));
  let text = line.runs.map((r, i) => (decoration[i] ? spaces(r.text.length) : r.text)).join('');
  const raw = FLIGHT_ROW.test(text) ? [] : collectLinks(line.runs, decoration);
  const hint = nextHint(text, raw, otherRows);
  if (hint) text = text.slice(0, hint.from) + spaces(hint.to - hint.from) + text.slice(hint.to);
  const between = raw.map((l, i) =>
    text.slice(l.column + l.length, i + 1 < raw.length ? raw[i + 1].column : text.length),
  );
  // `340,345-346 Yle Radio1`: links joined by a comma share the last one's name.
  const inGroup = between.map((b, i) => i + 1 < raw.length && /^,\s?$/.test(b));
  const after = between.map(labelAfter);
  for (let i = raw.length - 2; i >= 0; i--) if (inGroup[i]) after[i] = after[i + 1];
  const before = raw.map((l, i) =>
    text.slice(i > 0 ? raw[i - 1].column + raw[i - 1].length : 0, l.column),
  );
  const refs = raw.map((l, i) => (l.target.kind === 'url' ? undefined : pageRefLabel(before[i])));
  const links = raw.map((l, i): LinkSpan => {
    const ref = refs[i];
    return ref === undefined
      ? { ...l, label: after[i].label || labelBefore(before[i]) }
      : { ...l, label: ref, pageRef: true };
  });
  const realRuns = line.runs.filter((r, i) => !decoration[i] && r.text.trim() !== '');
  return {
    line,
    text,
    links,
    entries: after.filter((_, i) => !inGroup[i]),
    before,
    hasDecoration: line.runs.some((r, i) => decoration[i] && r.text.trim() !== ''),
    hasColouredBg: line.runs.some((r) => r.bg !== 'black'),
    colouredText: realRuns.some((r) => r.bg !== 'black'),
    doubleHeightText: realRuns.some((r) => r.doubleHeight),
    doubleHeightCopy: line.runs.some((r) => r.doubleHeight && !r.hasText) && text.trim() === '',
    arrow: BOARD_ARROW.test(line.runs.map((r) => r.text).join('')),
    firstColumn: text.search(/\S/),
  };
}

/** The header band is row 1 plus rows 2..4 that carry graphics or a coloured bar. */
const HEADER_LAST_ROW = 4;
/** Index entries start at the left edge; a link further right is a second column. */
const LEFT_EDGE = 3;
const MIN_TIME_ROWS = 3;

/*
 * Regexes here and in blocks.ts / reflow.ts must stay linear in the text's
 * length: no two greedy parts that can match the same characters
 * (`\S*\d\S*`, `[^()]*\p{L}[^()]*`), and no unanchored `x+$` that retries from
 * every position. Rows are capped at 40 columns by normalize, but paragraphs
 * join many rows, and a cubic regex froze the app on a malformed page
 * (PUB.11). analyse.test.ts times the whole pipeline on 5,000-character rows.
 */
const TIME_ROW = /^\s*\d{1,2}[.:]\d{2}\s+\S/;
/** `Home - Away`: split from the score test below so they run one after the other. */
const MATCH_TEAMS = /\S\s+-\s+\S/;
/** `   1-0`, `  18.30`, `  klo 18.30` at the row's end, after a wide gap. */
const MATCH_RESULT = /^.*\S\s{2,}(\d{1,3}-\d{1,3}|(klo\s+)?\d{1,2}[.:]\d{2})\s*$/;
const NUMBER_COLUMN = /\S\s{2,}[-+]?\d[\d.,:%+\-=]*\s*$/;
const DATE_ONLY = /^\s*(\p{L}{2}\s+)?\d{1,2}\.\d{1,2}\.(\d{2,4})?\s*$/u;
/** One optional first token, then one bracketed note; see `isBracketNote`. */
const BRACKET_NOTE = /^\s*(?:(\S+)\s+)?\(([^()]*)\)\s*$/u;

/**
 * `Home - Away   1-0` or `… 18.30`: teams joined by a spaced dash, then later
 * on the row a wide gap and a score or a time at the end. Same rows as the
 * one regex `\S\s+-\s+\S.*\S\s{2,}(…)\s*$` it replaces, which retried the
 * whole rest of the row from every dash and was quadratic (unless the row
 * holds a line break, which a teletext row cannot).
 */
function isMatchRow(text: string): boolean {
  const teams = MATCH_TEAMS.exec(text);
  return teams !== null && MATCH_RESULT.test(text.slice(teams.index + teams[0].length));
}

/**
 * `(Koivunen)`, `(Aho, Laine)`, or `Nugent-Hopkins24 (Aho)`: one bracketed
 * note with a letter in it, optionally after one token that holds a digit.
 * The digit and letter tests run on the captured parts, not inside the regex:
 * `\S*\d\S*` and `[^()]*\p{L}[^()]*` made it cubic on a long row like
 * `1111… (aaaa…` with no closing bracket.
 */
export function isBracketNote(text: string): boolean {
  const m = BRACKET_NOTE.exec(text);
  if (!m) return false;
  const [, token, note] = m;
  if (token !== undefined && !/\d/.test(token)) return false;
  return /\p{L}/u.test(note);
}

/** Ends in `n` or more spaces (`/\s{n,}$/` without retrying from every space). */
function endsWithGap(text: string, n: number): boolean {
  return text.length - text.trimEnd().length >= n;
}

/** Wide (2+ space) gaps between words, ignoring the row's edges. */
function wideGaps(text: string): number {
  return (text.trim().match(/\s{2,}/g) ?? []).length;
}

/** Two or more wide gaps: text set in columns (standings, weather, legends). */
function looksLikeColumns(text: string): boolean {
  return wideGaps(text) >= 2;
}

/**
 * Loose table test, only used right next to a table row: any wide gap, or
 * mostly number tokens (`Amsterdam +12vk SW6 +11vs` on 408).
 */
function tableLike(text: string): boolean {
  if (wideGaps(text) >= 1) return true;
  const tokens = text.trim().split(/\s+/);
  const numeric = tokens.filter((t) => /\d/.test(t)).length;
  return numeric >= 3 && numeric * 2 >= tokens.length;
}

/** Columns where a row's pieces start; pieces are separated by 2+ spaces. */
function pieceColumns(text: string): number[] {
  return [...text.matchAll(/\S+(?: \S+)*/g)].map((m) => m.index);
}

/**
 * Symbols but no word and no number: `-----`, `! #!! !"`, `ppsss3##`. Needs a
 * symbol, so letter-only rows like `T A` (TV flags) or `P Ö R S S I` stay.
 */
function looksLikeDecoration(text: string): boolean {
  return !hasWord(text) && !hasNumber(text) && /[^\p{L}\d\s]/u.test(text);
}

type Decision = { kind: LineKind; rule: RuleId };

/**
 * Page links in the middle of running text. Yle marks every 3-digit number as
 * a link, so `urallaan 120 NHL-ottelua ja 126 AHL-` (202) would otherwise read
 * as two index entries. Index rows start with their link or a capitalised
 * name and set columns apart with wide gaps; a row that starts with a
 * lower-case word, holds no wide gap and only page links continues a
 * sentence. Rows starting with a capital or a number are left to the link
 * rules (too close to `136 Putin: …` headlines to tell apart safely).
 */
function isRunningText(f: Features): boolean {
  const { links, text } = f;
  if (links.length === 0) return false;
  if (!links.every((l) => l.target.kind === 'page')) return false;
  if (links[0].column <= f.firstColumn) return false;
  if (!/^\p{Ll}/u.test(text.slice(f.firstColumn))) return false;
  return wideGaps(text) === 0;
}

/** What may join a page link to the page reference before it: `577, 582`, `333 ja 334`. */
const REF_CHAIN = /^\s*(?:,|&|ja|och|tai|eller)?\s*$/iu;

/**
 * Rule `page-ref` (row part): a row that holds nothing but page references,
 * `Otteluseuranta s. 241` (242, 263), `Keskihinnat s.188` (189, once its
 * `next-hint` is blanked), `M-S sivu 197, T-Y sivu 198` (196): the first link
 * has a page word before it and a capitalised name before that at the row's
 * start; every later link has its own name and page word after a `,` or `&`,
 * or is chained to the one before (`, `, `ja`); nothing follows the last link.
 * It is a link row, so the reader shows `Otteluseuranta` as a link to 241
 * instead of the text `Otteluseuranta s.` and a bare number.
 */
function isPageRefRow(f: Features): boolean {
  const { links, text } = f;
  const last = links.at(-1);
  if (!last || !links[0].pageRef || !CAPITALISED.test(links[0].label)) return false;
  if (links.some((l) => l.target.kind === 'url')) return false;
  if (text.slice(last.column + last.length).trim() !== '') return false;
  return links.every((l, i) => {
    const b = f.before[i];
    if (!l.pageRef) return i > 0 && REF_CHAIN.test(b);
    const at = b.lastIndexOf(l.label);
    if (at < 0) return false;
    const lead = b.slice(0, at);
    return i === 0 ? lead.trim() === '' : /^[\s,;&]*$/.test(lead);
  });
}

/** One name of a `name-link` row and the page links it names. */
export interface NameLinkPart<L extends RawLink = RawLink> {
  /** The name as on screen, trimmed: `DIGITA tiedottaa`, `5 vrk ennuste`. */
  name: string;
  /** Column where the name starts. */
  column: number;
  /** Its links in column order; more than one when chained (`577, 582, 588`). */
  links: L[];
}

/** A `name-link` row taken apart; see `nameLinkRow`. */
export interface NameLinkRow<L extends RawLink = RawLink> {
  parts: NameLinkPart<L>[];
  /** A bracketed note right after the last link, `(marras-huhtikuu)`, or `(loka-` when it wraps. */
  note: string;
  /** The row ends in `,` or `&`: its list of numbers goes on on the next row. */
  open: boolean;
  /** Text after a wide (3+ space) gap at the end: the wrapped end of the row above (`toukokuu)`). */
  rest: { column: number; text: string }[];
}

/** What may join two links of one name: `577, 582`, `700,799`, `342 & 348`, `333 ja 334`. */
const NAME_CHAIN = /^ ?(?:,|&|ja|och|tai|eller)? ?$/u;
/** After the last link: nothing, an open chain (`305, 312, 317,`), a note, or `)`. */
const NAME_TAIL = /^(?: ?[,&]| \([^()]*\)?|\))?$/u;

/** A name: two letters in a row, no wide gap inside, ending one or two spaces before its link. */
function isLinkName(text: string): boolean {
  const name = text.trim();
  return (
    name !== '' &&
    hasLetters(name) &&
    wideGaps(name) === 0 &&
    endsWithGap(text, 1) &&
    !endsWithGap(text, 3)
  );
}

/**
 * Rule `name-link` (shape part): an index entry that gives its name first and
 * then its page number, as the alphabetical index 196-198 does:
 *
 * - the row starts with a name, then one or two spaces, then a page link or
 *   range: `Aikataulut 400`, `Areena 386-395`, `Kultur och nöje  720`;
 * - more links follow, either chained to the one before (`577, 582, 588`,
 *   `342 & 348`) or each with its own name (`Säätiedotus 401, 5 vrk ennuste
 *   405`, `pohjoissaami 520 inarinsaami 521`, `Lintutilanne 888     Lista 804`,
 *   `3 vrk 407 (selitteet 419)`); `,` `;` `&` `(` before a name are left out;
 * - after the last link only a bracketed note (`(marras-huhtikuu)`, which
 *   joins the last name), an open `,` or `&`, a `)`, and after a wide gap the
 *   wrapped end of the row above.
 *
 * Undefined for anything else, also for web links: the row is then left to
 * the other rules. Wording is never changed, only cut into names and numbers.
 */
export function nameLinkRow<L extends RawLink>(
  text: string,
  links: readonly L[],
): NameLinkRow<L> | undefined {
  const first = links[0];
  if (!first || links.some((l) => l.target.kind === 'url')) return undefined;
  const lead = text.slice(0, first.column);
  if (!isLinkName(lead) || !/^\s*["'«(]?[\p{L}\d]/u.test(lead)) return undefined;
  const parts: NameLinkPart<L>[] = [
    { name: lead.trim(), column: lead.search(/\S/), links: [first] },
  ];
  for (let i = 1; i < links.length; i++) {
    const end = links[i - 1].column + links[i - 1].length;
    const between = text.slice(end, links[i].column);
    if (NAME_CHAIN.test(between)) {
      parts[parts.length - 1].links.push(links[i]);
      continue;
    }
    // Anchored at the start, so linear (see the note above TIME_ROW).
    const words = between.replace(/^[\s,;&(]+/, '');
    if (!isLinkName(words)) return undefined;
    parts.push({
      name: words.trim(),
      column: end + between.length - words.length,
      links: [links[i]],
    });
  }
  const last = links[links.length - 1];
  const tailStart = last.column + last.length;
  const tail = text.slice(tailStart).trimEnd();
  const gap = tail.indexOf('   ');
  const head = gap >= 0 ? tail.slice(0, gap) : tail;
  if (!NAME_TAIL.test(head)) return undefined;
  const rest: NameLinkRow['rest'] = [];
  if (gap >= 0) {
    for (const m of tail.slice(gap).matchAll(/\S+(?: \S+)*/g)) {
      rest.push({ column: tailStart + gap + m.index, text: m[0] });
    }
  }
  const note = head.trim().startsWith('(') ? head.trim() : '';
  return { parts, note, open: /[,&]$/.test(head), rest };
}

/** Rows a subpage needs of the `name-link` shape before they count as index entries. */
const MIN_NAME_LINK_ROWS = 3;

function classifyLinks(f: Features): Decision | undefined {
  const { links, entries, text } = f;
  if (links.length === 0) return undefined;
  const named = entries.filter((e) => hasLetters(e.label) && CAPITALISED.test(e.label)).length;
  const first = links[0];
  const atLeftEdge = first.column === f.firstColumn && first.column <= LEFT_EDGE;

  if (named >= 2) return { kind: 'nav', rule: 'link-columns' };
  if (named === 1) {
    if (atLeftEdge && entries.length === 1) {
      return entries[0].remainder === ''
        ? { kind: 'headline', rule: 'link-title' }
        : { kind: 'nav', rule: 'link-columns' };
    }
    // Right-hand column: nothing before the link, or a wide gap before it.
    const before = text.slice(0, first.column);
    if (first.column > LEFT_EDGE && (before.trim() === '' || endsWithGap(before, 3))) {
      return { kind: 'nav', rule: 'link-column' };
    }
  }
  // `Säähakemisto   400`: one name, a wide gap, then the link at the row's end.
  // Only one column of text, starting with a capital: `1. Toyota    662` and
  // `1. Kimi Antonelli   ITA Mercedes  340` are tables.
  if (links.length === 1 && text.slice(first.column + first.length).trim() === '') {
    const before = text.slice(0, first.column);
    const name = before.trim();
    if (
      /\S\s{2,}$/.test(before) &&
      name === first.label &&
      /^\p{Lu}/u.test(name) &&
      hasWord(name)
    ) {
      return { kind: 'nav', rule: 'link-column' };
    }
  }
  let rest = text;
  for (const l of links) {
    rest = rest.slice(0, l.column) + spaces(l.length) + rest.slice(l.column + l.length);
  }
  if (!/[\p{L}\d]/u.test(rest)) return { kind: 'nav', rule: 'link-only' };
  return undefined;
}

function classifyLine(
  f: Features,
  inHeaderBand: boolean,
  timeRows: number,
  nameLink: boolean,
): Decision {
  const { text, links } = f;

  if (f.line.number === 1) return { kind: 'drop', rule: 'header-row' };
  if (f.doubleHeightCopy) return { kind: 'drop', rule: 'double-height-copy' };
  if (f.arrow && timeRows >= MIN_TIME_ROWS) return { kind: 'drop', rule: 'board-arrow' };
  if (text.trim() === '') {
    return f.hasDecoration
      ? { kind: 'drop', rule: 'graphics-only' }
      : { kind: 'blank', rule: 'blank' };
  }
  if (inHeaderBand && links.length === 0 && !looksLikeColumns(text)) {
    // Keep anything readable: the TV-guide day ("Torstai 22.10.") is only here.
    return { kind: looksLikeDecoration(text) ? 'drop' : 'title', rule: 'title-row' };
  }
  if (links.length === 0 && looksLikeDecoration(text)) {
    return { kind: 'drop', rule: 'decoration-text' };
  }
  // A page reference's name counts even when short: `M-S sivu 197` on the 196 bar.
  if (f.colouredText && links.some((l) => hasLetters(l.label) || l.pageRef)) {
    return { kind: 'nav', rule: 'coloured-nav' };
  }
  // Before `page-ref`: on an index, `Valkoinen sivu 579` (198) is the page's name.
  if (nameLink) return { kind: 'nav', rule: 'name-link' };
  if (isPageRefRow(f)) return { kind: 'nav', rule: 'page-ref' };
  const runningText = isRunningText(f);
  const byLinks = runningText ? undefined : classifyLinks(f);
  if (byLinks) return byLinks;
  if (f.doubleHeightText) return { kind: 'heading', rule: 'double-height' };
  if (runningText) return { kind: 'paragraph', rule: 'running-text' };
  if (isMatchRow(text)) return { kind: 'table', rule: 'match-row' };
  if (looksLikeColumns(text)) return { kind: 'table', rule: 'columns' };
  if (NUMBER_COLUMN.test(text)) return { kind: 'table', rule: 'number-column' };
  if (TIME_ROW.test(text) && timeRows >= MIN_TIME_ROWS) return { kind: 'table', rule: 'time-row' };
  return { kind: 'paragraph', rule: 'text' };
}

/**
 * Rule `coloured-title` (shape part): one page link (or range) where the row's
 * text starts, then a capitalised name with a real word and nothing after it:
 * `592 Puolustusvoimien ampumatiedotteet` (400 row 23).
 */
function isColouredTitle(f: Features): boolean {
  const { links, entries } = f;
  if (links.length !== 1 || links[0].target.kind === 'url') return false;
  if (links[0].column !== f.firstColumn || links[0].pageRef) return false;
  const [entry] = entries;
  return (
    entry !== undefined &&
    entry.remainder === '' &&
    CAPITALISED.test(entry.label) &&
    hasWord(entry.label)
  );
}

/** Second pass: rows that only make sense next to their neighbours. */
function applyContext(out: ClassifiedLine[], fs: Features[]): void {
  // coloured-title: before `continuation`, so a wrapped row under it would join it.
  if (out.some((l) => l.rule === 'link-title')) {
    out.forEach((cur, i) => {
      if (cur.rule === 'coloured-nav' && isColouredTitle(fs[i])) {
        cur.kind = 'headline';
        cur.rule = 'coloured-title';
      }
    });
  }

  // continuation: compare with the first column of the row that started the entry.
  let anchor = -1;
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    const prev = out[i - 1];
    const col = fs[i].firstColumn;
    if (
      prev &&
      (cur.rule === 'text' || cur.rule === 'running-text') &&
      (prev.kind === 'headline' ||
        prev.kind === 'nav' ||
        prev.rule === 'time-row' ||
        (prev.rule === 'continuation' && prev.kind === 'table')) &&
      prev.number === cur.number - 1 &&
      anchor >= 0 &&
      col > anchor &&
      fs[i].colouredText === fs[i - 1].colouredText
    ) {
      cur.kind = prev.kind;
      cur.rule = 'continuation';
      continue;
    }
    anchor = fs[i].firstColumn;
  }

  // table-neighbour and table-note: repeat until nothing changes, so runs of rows join up.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const cur = out[i];
      if (cur.rule !== 'text') continue;
      const rule = tableLike(cur.text)
        ? 'table-neighbour'
        : isBracketNote(cur.text)
          ? 'table-note'
          : undefined;
      if (!rule) continue;
      if (out[i - 1]?.kind === 'table' || out[i + 1]?.kind === 'table') {
        cur.kind = 'table';
        cur.rule = rule;
        changed = true;
      }
    }
  }

  // table-header: skip the blank rows between the header and its first row.
  for (let i = 0; i + 1 < out.length; i++) {
    const cur = out[i];
    if (cur.rule !== 'text' || wideGaps(cur.text) < 1) continue;
    let j = i + 1;
    while (out[j]?.kind === 'blank') j++;
    const below = out[j];
    if (below?.kind !== 'table' || below.rule === 'continuation') continue;
    const under = pieceColumns(below.text);
    if (pieceColumns(cur.text).some((c) => under.includes(c))) {
      cur.kind = 'table';
      cur.rule = 'table-header';
    }
  }

  for (let i = 0; i + 1 < out.length; i++) {
    const cur = out[i];
    if (cur.rule === 'text' && DATE_ONLY.test(cur.text) && out[i + 1].kind === 'table') {
      cur.kind = 'table';
      cur.rule = 'table-date';
    }
  }
}

/**
 * Table rules that come from the row itself, not from its neighbours: a
 * caption or a column header only sits above a table that stands on its own.
 */
const TABLE_START_RULES: ReadonlySet<RuleId> = new Set<RuleId>([
  'columns',
  'match-row',
  'time-row',
  'table-header',
  'band-header',
]);

/** True when row `i + 1` is the very next row and a table row that stands on its own. */
function tableStartsBelow(out: readonly ClassifiedLine[], i: number): boolean {
  const below = out[i + 1];
  return (
    below !== undefined &&
    below.number === out[i].number + 1 &&
    below.kind === 'table' &&
    TABLE_START_RULES.has(below.rule)
  );
}

/** Rule `table-caption` (see the list at the top). */
function applyCaptions(out: ClassifiedLine[]): void {
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    if (cur.rule !== 'text' || !tableStartsBelow(out, i)) continue;
    const t = cur.text.trim();
    if (!/^\p{Lu}/u.test(t) || t.endsWith('.') || !hasWord(t)) continue;
    const above = out[i - 1];
    if (
      above?.number === cur.number - 1 &&
      above.kind === 'paragraph' &&
      !endsSentence(above.text)
    ) {
      continue;
    }
    cur.kind = 'heading';
    cur.rule = 'table-caption';
  }
}

interface Piece {
  text: string;
  start: number;
  end: number;
}

/** A row's pieces (split at 2+ spaces) with the columns where each starts and ends. */
function pieceSpans(text: string): Piece[] {
  return [...text.matchAll(/\S+(?: \S+)*/g)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/**
 * Column labels: every piece has a letter and none is a number or a date
 * (`1/16`, `24.10.`), and the labels are mostly capitals, as Yle writes them
 * (`OSUUDEN`, `%12KK`, `VAIHTO/e`). Titles and notes are not: `Lähde: FactSet
 * ja OMX` (174), `Keskiviikko 21.10.` (301).
 */
function isColumnLabels(pieces: readonly Piece[]): boolean {
  if (pieces.length === 0) return false;
  if (pieces.some((p) => !/\p{L}/u.test(p.text) || hasNumber(p.text))) return false;
  const all = pieces.map((p) => p.text).join(' ');
  const upper = (all.match(/\p{Lu}/gu) ?? []).length;
  const lower = (all.match(/\p{Ll}/gu) ?? []).length;
  return upper >= lower;
}

/** Rule `band-header` (see the list at the top). `band[i]` is true for header band rows. */
function applyBandHeaders(out: ClassifiedLine[], band: readonly boolean[]): void {
  for (let i = out.length - 2; i >= 0; i--) {
    const cur = out[i];
    if (!band[i] || cur.links.length > 0) continue;
    if (cur.kind !== 'title' && cur.rule !== 'columns') continue;
    const below = out[i + 1];
    if (below.number !== cur.number + 1 || below.kind !== 'table') continue;
    const pieces = pieceSpans(cur.text);
    // The title is the band's first title row, or the end of one wrapped from
    // the row above. `OSTO` under `OMXH Large Cap …` (176) is a label.
    const titleAbove = out.some((l, j) => j < i && band[j] && l.kind === 'title');
    const prev = out[i - 1];
    const wrapped = prev?.kind === 'title' && /\S-$/u.test(prev.text.trimEnd());
    const title =
      (!titleAbove || wrapped) && pieces[0] && pieces[0].start <= LEFT_EDGE ? pieces[0] : undefined;
    const labels = title ? pieces.slice(1) : pieces;
    if (!isColumnLabels(labels)) continue;
    // Yle sets labels by hand, sometimes one cell off: `AIKA` at 17 over `19:00` at 18 (177).
    const edges = new Set<number>();
    for (let j = i + 1; out[j]?.kind === 'table'; j++) {
      for (const p of pieceSpans(out[j].text)) {
        for (const c of [p.start, p.end])
          edges
            .add(c - 1)
            .add(c)
            .add(c + 1);
      }
    }
    if (!labels.some((p) => edges.has(p.start) || edges.has(p.end))) continue;
    cur.kind = 'table';
    cur.rule = 'band-header';
    if (title) {
      cur.title = title.text;
      cur.text = spaces(title.end) + cur.text.slice(title.end);
    }
  }
}

/** A row's text with decoration blanked, trimmed: what `next-hint` compares with. */
function rowStart(line: Line): string {
  return line.runs
    .map((r) => (isDecorationRun(r) || isNextSubpageMarker(r) ? spaces(r.text.length) : r.text))
    .join('')
    .trim();
}

function classifyLines(lines: Line[], otherRows: readonly string[] = []): ClassifiedLine[] {
  const fs = lines.map((l) => features(l, otherRows));
  const timeRows = fs.filter((f) => TIME_ROW.test(f.text)).length;
  const named = fs.map((f) => (f.line.number > 1 ? nameLinkRow(f.text, f.links) : undefined));
  const indexRows = named.filter((r) => r !== undefined).length >= MIN_NAME_LINK_ROWS;

  let band = true;
  const inBand: boolean[] = [];
  const out = fs.map((f, i): ClassifiedLine => {
    const n = f.line.number;
    // A coloured row that starts with a time is data (425-427 stripe their flight rows).
    if (n > 1) {
      band =
        band &&
        n <= HEADER_LAST_ROW &&
        (f.hasDecoration || f.hasColouredBg) &&
        !TIME_ROW.test(f.text);
    }
    inBand.push(band && n > 1);
    const parts = indexRows ? named[i] : undefined;
    const { kind, rule } = classifyLine(f, band && n > 1, timeRows, parts !== undefined);
    // Each link of an index entry is named by its part's name, never as a page reference.
    const links =
      rule === 'name-link' && parts
        ? parts.parts.flatMap((p) =>
            p.links.map(({ target, text, column, length }): LinkSpan => ({
              target,
              text,
              column,
              length,
              label: p.name,
            })),
          )
        : f.links;
    return { number: n, kind, rule, text: f.text, links, line: f.line };
  });
  applyContext(out, fs);
  applyCaptions(out);
  applyBandHeaders(out, inBand);
  return out;
}

/** Classify every row of every subpage. Pure; never throws for a normalised page. */
export function classify(page: Page): ClassifiedSubpage[] {
  // Rows of each subpage below the header row, for `next-hint`. Rows that end
  // in an arrow are hints themselves (`Turku   >>>` on every 425 board), not content.
  const rows = page.subpages.map((sp) =>
    sp.lines
      .filter((l) => l.number > 1)
      .map(rowStart)
      .filter((t) => t !== '' && !TRAILING_ARROW.test(t)),
  );
  return page.subpages.map((sp, i) => ({
    number: sp.number,
    lines: classifyLines(
      sp.lines,
      rows.flatMap((r, j) => (j === i ? [] : r)),
    ),
  }));
}
