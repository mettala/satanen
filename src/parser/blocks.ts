/**
 * Layer 3 of the parser: classified rows → reader blocks, the things the
 * reader screen draws (headings, flowing paragraphs, link lists, tables,
 * subpage dividers).
 *
 * Pure function over `normalize()` + `classify()` output; never throws for a
 * normalised page. Licence rule: Yle's wording is never changed. Rows are
 * only re-joined (line breaks, spaces, soft hyphens; see reflow.ts) and
 * decoration is left out. Each rule below has a fixture test in
 * blocks.test.ts.
 *
 * Rules, by classified row kind:
 *
 * - `title`: the page's own title rows (TV-guide day, weather issue time).
 *   Rows that only repeat the page name or the masthead (`Teksti-TV` on 100,
 *   `Yle` on 101, `P Ö R S S I S I V U T` on 175 "Pörssisivut") are left out.
 *   On subpage 1 they become `title` blocks; on later subpages they label the
 *   subpage divider, unless every subpage has the same title (403), in which
 *   case it is shown once at the top. A `band-header` row's title piece
 *   counts as a title row, and a title wrapped over two rows is one title
 *   (see `subpageTitles`).
 * - `heading`: consecutive double-height rows → one heading.
 * - `paragraph`: rows between blank rows → paragraphs. Wrapped rows are joined
 *   (`isSoftWrap`); a deliberate line break becomes a new paragraph after a
 *   full stop (725 has no blank rows) and a `\n` otherwise. A wide gap (3+
 *   spaces) inside a row is also a `\n` (`A = Jo Areenassa    A = Tulee…`).
 * - inline links: Yle marks every 3-digit number as a link, so a page link
 *   is only kept after a page word (`s.`, `sivu…`, `sid…`, `page…`), or
 *   chained to such a link by `,` `-` `ja` `och` `and` `&`
 *   (`Sivuilla 301,302,305,310-317 ja 321-322` on 330). Web links are kept.
 * - `headline` / `nav`: runs of these rows → one `linkList`. Coloured bottom
 *   bars (`coloured-nav`) are a separate list with `variant: 'bar'`. Blank
 *   rows do not end a list. Each piece of text names one link only (the 301
 *   bar where classify gives two links the same label). A `continuation` row appends its text to the
 *   entry above it, by column. Other leftover text on a link row (not a link,
 *   not a label) does the same when it reads as a continuation (lower-case
 *   start, or the entry above ends in `-`, `/`, `&`); otherwise it becomes a
 *   paragraph between two lists, so nothing is lost.
 * - index entries with the name first (`name-link`, 196-198): one entry per
 *   name, every page number its own link (`DIGITA tiedottaa 577, 582, 588`:
 *   577, then `more` 582 and 588; a range opens its first page). A note after
 *   the numbers joins the name (`Jalankulkusää (marras-huhtikuu)`). A row
 *   ending in `,` or `&` goes on in a numbers-only row below, whose numbers
 *   join the same entry (`Yle Teema & Fem 305, 312, 317,` + `359-360 & 774-776`).
 * - letter headings (`LETTER_HEADING_PAGES`, 196-198): a heading with the
 *   letter before each letter group of the alphabetical index and at the top
 *   of each subpage, where Yle draws a big letter in graphics.
 * - `table`: consecutive rows kept verbatim (common indent and trailing spaces
 *   removed) as monospace lines. Links in table rows are ignored.
 * - subpages are joined into one stream with a `subpageDivider` before
 *   subpages 2..n.
 * - `headerName`: the page's name from its header row, for the favourite card
 *   of a table page (row 1 is left out of the blocks). When the name differs
 *   between subpages (425 is the Tampere-Pirkkala, Turku and Oulu boards in
 *   one page, and the sports tables 233 to 260) it is also shown, as a title above
 *   subpage 1 and in the divider where it changes (table pages only).
 * - repeated footers (`repeatedFooters`): the closing text rows of a subpage
 *   that an earlier subpage ended with too (425 closes three boards with the
 *   same two Helsinki-Vantaa lines) are shown once. A `page-ref` row counts
 *   as text here (`HELSINKI-VANTAA s. 426-427` on 425, `Keskihinnat s.188` on 189).
 * - repeated rows (`repeatedRows`): a link row (`headline` / `nav`) that is
 *   the same row with the same text on every subpage is kept once, on
 *   subpage 1. Page 100 repeats its masthead links and all five headlines
 *   on each of its 4 subpages; only the section bar below them changes.
 *   Only rows found on every subpage count: rows repeated on some subpages
 *   are real content (417's 44 road notices share many rows). Table rows are
 *   never dropped (408 repeats its column header, which each table needs),
 *   nor paragraphs (one shared row in the middle of a sentence would break
 *   it). Titles have their own rule above.
 * - stamp (`pageStamp`): a date and time with minutes in the header row or a
 *   title row, with the words before it (`Rahastojen arvot 24.10. 20:40` on
 *   181-187, `Helsingin Pörssi 23.10. 18:35` on 175-180, `25.10. klo 23.10`
 *   on 188-189), says when the data is from. The reader shows it word for
 *   word in the meta line above the title; it is left out of the titles.
 * - table headers: leading `band-header` and `table-header` rows are counted
 *   in `TableBlock.headerRows`, so the reader can set them apart as the
 *   column labels. Each subpage's table keeps its own header.
 * - rising and falling prices (`trendMarks`): page 175 says rising changes
 *   are yellow and falling ones blue (cyan) on the stock pages. In a table
 *   whose header has a `MUUTOS` label (176-187), a yellow run holding only a
 *   `+` number and a cyan run holding only a `-` number are marked in
 *   `TableBlock.trends`. Colour and sign must agree; anything else (a white
 *   `-` for no data on 187) stays plain. The text is not changed.
 * - contact lines (`contactRows`): on an index page (every other row is a
 *   link row), a stretch of rows that holds an e-mail address and a phone
 *   number or postal address (`PL 24`, `00024`) is Yle's contact details.
 *   It becomes one `contact` block at the end of its subpage, one entry per
 *   row, wording unchanged (spaces tidied); e-mail and web links stay links.
 *   101 and 799 have one; 417's road notices also give a phone and e-mail,
 *   but they are text pages, so they are left alone.
 * - sorted link lists (`SORTED_LINK_PAGES`, only 101): every `list` entry of
 *   the subpage becomes one list in page-number order, instead of reading
 *   Yle's two columns across. Text that stood between the lists (101's
 *   `UUTISET`) goes before the list; bars are not touched. This is an owner
 *   decision for one page, not something the layout shows (on 199, 200 and
 *   575 Yle's own order groups sections), so it is a page list, not a rule.
 * - column pages (`COLUMN_PAGES`, only 300): the two 20-cell columns are read
 *   top to bottom, left first, instead of across. Rows that run across the
 *   middle (`Aakkosellinen hakemisto 196-198`) end a band. Text without a
 *   link in a column is a heading, or the wrapped end of the entry above;
 *   blank rows end a list.
 */
import {
  classify,
  hasWord,
  isPageRefGap,
  nameLinkRow,
  type ClassifiedLine,
  type ClassifiedSubpage,
  type LinkSpan,
  type ReaderLink,
} from './classify';
import type { Page } from './model';
import { endsSentence, isSoftWrap, joinWrapped, rowShape, type RowShape } from './reflow';

export type InlineSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'link';
      /** On-screen text of the link, e.g. `411-413` or `yle.fi/uutiset`. */
      text: string;
      target: ReaderLink;
    };

export interface TitleBlock {
  kind: 'title';
  /** A title row such as `Säätiedotus klo 22` or `TV1 Keskiviikko 21.10.`. */
  text: string;
}

export interface HeadingBlock {
  kind: 'heading';
  text: string;
}

export interface ParagraphBlock {
  kind: 'paragraph';
  /**
   * Text and inline links in reading order. Text may contain `\n` where the
   * editor broke a line on purpose (lists, legends).
   */
  segments: InlineSegment[];
}

export interface LinkEntry {
  /**
   * The entry's name (`Kotimaa`, `Putin: Olen valmis neuvotteluihin`). `""`
   * when the row has only the link (`426-427`, `yle.fi/news`): show `linkText`.
   */
  label: string;
  /** Where it goes. For `340,345-346 Yle Radio1` this is the first link. */
  target: ReaderLink;
  /** On-screen link text: `105`, `406-408`, `340,345-346`, `yle.fi/uutiset`. */
  linkText: string;
  /**
   * The entry's other page numbers, each its own link, after `target`: `582`
   * and `588` of `DIGITA tiedottaa 577, 582, 588` (196). Only on index
   * entries that give their name first (`name-link`); absent otherwise.
   */
  more?: EntryLink[];
}

/** One more link of a `LinkEntry`: its on-screen text and where it goes. */
export interface EntryLink {
  text: string;
  target: ReaderLink;
}

export interface LinkListBlock {
  kind: 'linkList';
  /** `bar`: a coloured bar of section links (page bottoms, 100 row 18–23). */
  variant: 'list' | 'bar';
  entries: LinkEntry[];
}

export interface TableBlock {
  kind: 'table';
  /** Rows as on screen, for a monospace font. Columns line up. */
  lines: string[];
  /**
   * How many of the first `lines` are column labels (`band-header` or
   * `table-header` rows), shown as the table's header. Absent when none.
   */
  headerRows?: number;
  /**
   * Price changes Yle coloured as rising (yellow) or falling (cyan), in
   * `lines` order, then column order. Only on tables with a `MUUTOS` column
   * label (stock and fund pages 176-187, see `trendMarks`). Absent when none.
   */
  trends?: TrendMark[];
}

/** One coloured price change in a table: `+0,52` on 176 is `up`. */
export interface TrendMark {
  /** Index into `TableBlock.lines`. */
  line: number;
  /** First character of the value in that line. */
  column: number;
  /** Length of the value, sign included (`-11,70` is 6). */
  length: number;
  trend: 'up' | 'down';
}

export interface SubpageDividerBlock {
  kind: 'subpageDivider';
  /** Subpage number (shown as `2/3`). */
  number: number;
  /** Number of subpages. */
  count: number;
  /** This subpage's own title rows (TV-guide day, weather issue time), may be empty. */
  titles: string[];
}

/**
 * Yle's contact details (address, e-mail, phone, web) from an index page,
 * moved to the end of the subpage. The reader adds the "Yhteystiedot" heading.
 */
export interface ContactBlock {
  kind: 'contact';
  /** One entry per teletext row, as on screen with spaces tidied. */
  lines: InlineSegment[][];
}

export type ReaderBlock =
  | TitleBlock
  | HeadingBlock
  | ParagraphBlock
  | LinkListBlock
  | TableBlock
  | SubpageDividerBlock
  | ContactBlock;

// ---------------------------------------------------------------- titles

/** Brand-only titles; letters only, lower case. */
const MASTHEADS = new Set(['tekstitv', 'yle', 'yletekstitv']);

function lettersOnly(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\d]/gu, '');
}

/** `Sää maa-asemilla 21.10. klo 20  1/3` → without the subpage counter. */
function cleanTitle(text: string): string {
  // `(\S|^)` makes the match start where the spaces start, not at every
  // space (linear, see the note above TIME_ROW in classify.ts).
  return text
    .replace(/(\S|^)\s+\d{1,2}\/\d{1,2}\s*$/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The title text a row carries: a title row, or the title piece of a `band-header` row. */
function rowTitle(line: ClassifiedLine): string {
  if (line.kind === 'title') return cleanTitle(line.text);
  return line.title !== undefined ? cleanTitle(line.title) : '';
}

/**
 * The subpage's titles in row order. A title that ends in a word hyphen and
 * a next one that starts in lower case are one wrapped title (`Vaihtoehtoiset
 * ja kiinteistö-` + `rahastot` on 187), joined like paragraph rows. When the
 * page's stamp stood on a title row (`Pörssisähkö   25.10. klo 23.10` on 189),
 * the header row's name opens that title (`Nord Pool Pörssisähkö`): Yle set
 * one name over rows 1 and 2.
 */
function subpageTitles(sp: ClassifiedSubpage, pageName: string, stampRow?: number): string[] {
  const name = lettersOnly(pageName);
  const out: string[] = [];
  for (const line of sp.lines) {
    let t = rowTitle(line);
    if (stampRow !== undefined && stampRow > 1 && line.number === stampRow) {
      const header = headerName(sp);
      if (header !== undefined) t = t === '' ? header : `${header} ${t}`;
    }
    if (t === '') continue;
    const prev = out.at(-1);
    if (prev !== undefined && /\S-$/u.test(prev) && /^\p{Ll}/u.test(t)) {
      out[out.length - 1] = joinWrapped(prev, t);
    } else {
      out.push(t);
    }
  }
  return out.filter((t) => !MASTHEADS.has(lettersOnly(t)) && lettersOnly(t) !== name);
}

// ----------------------------------------------------------------- stamp

/** Where Yle says when the data is from: `Rahastojen arvot 24.10. 20:40` (184). */
export interface PageStamp {
  /** The words exactly as Yle wrote them, spaces as on screen. */
  text: string;
  /** Row number and 0-based column of its first cell, on subpage 1. */
  row: number;
  column: number;
}

/**
 * A piece of a row that is a date and a clock time, with any words before
 * them: `Rahastojen arvot 24.10. 20:40`, `Helsingin Pörssi 23.10. 18:35`,
 * `25.10. klo 23.10`. Minutes are required: `21.10. klo 20` (402) is a
 * forecast hour, not when the data is from. Linear: words cannot hold digits.
 */
const STAMP =
  /^(?:\p{L}[\p{L}-]*(?: \p{L}[\p{L}-]*)* )?\d{1,2}\.\d{1,2}\.(?:\d{2,4})? (?:klo )?\d{1,2}[.:]\d{2}$/u;

/**
 * The page's stamp (RP.9): on subpage 1, the first piece (split at 2+
 * spaces) of the header row or a title row that `STAMP` matches. The reader
 * shows it in the meta line above the title instead of the page's own
 * last-changed time, word for word, and leaves it out of the titles.
 * Undefined when there is none (all news articles).
 */
export function pageStamp(subpages: readonly ClassifiedSubpage[]): PageStamp | undefined {
  for (const line of subpages[0]?.lines ?? []) {
    if (line.number !== 1 && line.kind !== 'title') continue;
    for (const m of line.text.matchAll(/\S+(?: \S+)*/g)) {
      if (STAMP.test(m[0])) return { text: m[0], row: line.number, column: m.index };
    }
  }
  return undefined;
}

/** The subpages with the stamp's cells blanked wherever the same words stand in the same place. */
function withoutStamp(
  subpages: readonly ClassifiedSubpage[],
  stamp: PageStamp,
): ClassifiedSubpage[] {
  const end = stamp.column + stamp.text.length;
  return subpages.map((sp) => ({
    ...sp,
    lines: sp.lines.map((l) =>
      l.number === stamp.row && l.text.slice(stamp.column, end) === stamp.text
        ? {
            ...l,
            text: l.text.slice(0, stamp.column) + ' '.repeat(stamp.text.length) + l.text.slice(end),
          }
        : l,
    ),
  }));
}

/** `23.10.`, `20.10.2026`: a date with nothing else. */
const DATE_PIECE = /^\d{1,2}\.\d{1,2}\.(\d{2,4})?$/;
/** Capital-letter codes with no vowel run, kept as names: `T18 SM`, `U20`. */
const CODE_PIECE = /^(?=.*\p{Lu})[\p{Lu}\d]+(?: [\p{Lu}\d]+)*$/u;

/**
 * The page's name from its header row (row 1), e.g. `NHL-JÄÄKIEKKO` on 235 or
 * `JALKAPALLO T18 SM` on 250. Reader mode drops this row (`header-row`), but
 * on table pages it is the only name Yle gives. The row is split at wide
 * (2+ space) gaps; the subpage counter (`1/5`), date-only pieces, mastheads
 * (`YLE`) and pieces with neither a real word nor a capital-letter code
 * (`T18 SM`) are left out, so mosaic codes sent as text (`0\`0 p`) go. The
 * rest is joined with one space. Undefined when nothing is left.
 */
export function headerName(sp: ClassifiedSubpage | undefined): string | undefined {
  const row = sp?.lines.find((l) => l.number === 1);
  if (!row) return undefined;
  const kept = row.text
    .trim()
    .split(/\s{2,}/)
    .filter(
      (p) =>
        !/^\d{1,2}\/\d{1,2}$/.test(p) &&
        !DATE_PIECE.test(p) &&
        !MASTHEADS.has(lettersOnly(p)) &&
        (hasWord(p) || CODE_PIECE.test(p)),
    );
  const name = kept.join(' ').replace(/\s+/g, ' ');
  return name === '' ? undefined : name;
}

// ------------------------------------------------------------ paragraphs

type Seg = InlineSegment;

/** Page words that make the number after them a page reference. */
const PAGE_WORD = /(?:^|[^\p{L}])(?:s\.|sivu\p{L}*|sid\.|sid(?:an|orna|a)|pages?|p\.)\s*$/iu;
/** What may stand between two page references in one list. */
const CHAIN = /^\s*(?:(?:,|-|–|&|ja|och|and|tai|eller|or)\s*)?$/iu;

/**
 * Turn page links that are not page references back into text: `161
 * prosenttia` (162), `206,91` (175), `kraschade 150` (725) stay plain.
 */
function resolveLinks(segs: Seg[]): Seg[] {
  const accepted: boolean[] = [];
  let before = '';
  segs.forEach((s, i) => {
    if (s.kind === 'text') {
      accepted.push(false);
      before += s.text;
      return;
    }
    let ok = s.target.kind === 'url' || PAGE_WORD.test(before);
    if (!ok) {
      const prev = segs[i - 1];
      ok =
        (accepted[i - 1] && prev.kind === 'link') ||
        (prev?.kind === 'text' && CHAIN.test(prev.text) && accepted[i - 2] === true);
    }
    accepted.push(ok);
    before += s.text;
  });
  return mergeText(segs.map((s, i) => (s.kind === 'link' && !accepted[i] ? text(s.text) : s)));
}

function text(t: string): Seg {
  return { kind: 'text', text: t };
}

function mergeText(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (s.kind === 'text' && last?.kind === 'text') last.text += s.text;
    else if (s.kind === 'link' || s.text !== '') out.push({ ...s });
  }
  return out;
}

/**
 * One paragraph row as segments: links cut out by column, whitespace tidied.
 * A wide gap (3+ spaces) becomes `\n`, other space runs one space.
 */
function rowSegments(line: ClassifiedLine): Seg[] {
  const segs: Seg[] = [];
  let at = 0;
  for (const l of line.links) {
    if (l.column < at) continue;
    segs.push(text(line.text.slice(at, l.column)));
    segs.push({ kind: 'link', text: l.text.trim(), target: l.target });
    at = l.column + l.length;
  }
  segs.push(text(line.text.slice(at)));
  const tidy = segs.map((s) =>
    s.kind === 'text' ? text(s.text.replace(/ {3,}/g, '\n').replace(/ {2,}/g, ' ')) : s,
  );
  const first = tidy[0];
  const last = tidy[tidy.length - 1];
  if (first.kind === 'text') first.text = first.text.trimStart();
  if (last.kind === 'text') last.text = last.text.trimEnd();
  return mergeText(tidy);
}

/** Append `next` row segments to `segs`, joined as a soft wrap or with `\n`. */
function appendRow(segs: Seg[], next: Seg[], soft: boolean): Seg[] {
  if (segs.length === 0) return next;
  const last = segs[segs.length - 1];
  const first = next[0];
  if (!soft) {
    if (last.kind === 'text') last.text += '\n';
    else segs.push(text('\n'));
    return mergeText([...segs, ...next]);
  }
  if (last.kind === 'text' && first?.kind === 'text') {
    const joined = joinWrapped(last.text, first.text);
    return mergeText([...segs.slice(0, -1), text(joined), ...next.slice(1)]);
  }
  return mergeText([...segs, text(' '), ...next]);
}

// ------------------------------------------------------------- link lists

interface RowEntry {
  entry: LinkEntry;
  /** Leftmost column of the entry's link or label, for matching continuations. */
  column: number;
}

interface Leftover {
  column: number;
  text: string;
}

function cleanLabel(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Text pieces of `text` split at wide (2+ space) gaps, with their columns. */
function pieces(text: string): Leftover[] {
  const out: Leftover[] = [];
  for (const m of text.matchAll(/\S+(?: \S+)*/g)) {
    if (/[\p{L}\d]/u.test(m[0])) out.push({ column: m.index, text: m[0] });
  }
  return out;
}

/**
 * Entries of one headline/nav row, plus any text that is neither a link nor
 * a link's label. Links joined by a comma (`340,345-346 Yle Radio1` on 199)
 * are one entry.
 *
 * Each piece of text names at most one link. Classify can give two links the
 * same words: on the 301 bar `TV1 huomenna 310  ylihuomenna 315` both get
 * `ylihuomenna` (after 310, before 315). Then the later link keeps the words
 * and the earlier one takes the free text just before it (`TV1 huomenna`);
 * if it has none, the earlier link keeps the words and the later gets `""`.
 */
function rowEntries(line: ClassifiedLine): { entries: RowEntry[]; leftovers: Leftover[] } {
  const t = line.text;
  const links = line.links;

  // Group comma-joined links.
  const groups: { first: LinkSpan; last: LinkSpan; start: number; end: number }[] = [];
  for (let i = 0; i < links.length; i++) {
    const first = links[i];
    let last = first;
    while (
      i + 1 < links.length &&
      /^,\s?$/.test(t.slice(last.column + last.length, links[i + 1].column))
    ) {
      last = links[++i];
    }
    groups.push({ first, last, start: first.column, end: last.column + last.length });
  }

  // Where each group's label sits: right after the link, or right before it.
  type Span = { from: number; to: number } | undefined;
  const spans: Span[] = groups.map((g) => {
    const label = g.last.label;
    if (!label) return undefined;
    const after = t.indexOf(label, g.end);
    if (after >= 0 && t.slice(g.end, after).trim() === '') {
      return { from: after, to: after + label.length };
    }
    // Before the link, a page word may stand between (`Ajatus päivälle s. 895`).
    const before = t.lastIndexOf(label, g.start - label.length);
    if (before >= 0 && isPageRefGap(t.slice(before + label.length, g.start))) {
      return { from: before, to: before + label.length };
    }
    return undefined;
  });

  /** Free text right before group `i`, after the previous group and its label. */
  const textBefore = (i: number): Span => {
    const prev = i > 0 ? Math.max(groups[i - 1].end, spans[i - 1]?.to ?? 0) : 0;
    const last = pieces(t.slice(prev, groups[i].start)).at(-1);
    if (!last || t.slice(prev + last.column + last.text.length, groups[i].start).trim() !== '') {
      return undefined;
    }
    return { from: prev + last.column, to: prev + last.column + last.text.length };
  };

  for (let i = 0; i + 1 < groups.length; i++) {
    const a = spans[i];
    const b = spans[i + 1];
    if (!a || !b || a.from !== b.from) continue;
    const own = textBefore(i);
    if (own) spans[i] = own;
    else spans[i + 1] = undefined;
  }

  const covered = [...t].map(() => false);
  const cover = (from: number, to: number) => {
    for (let c = Math.max(0, from); c < Math.min(to, covered.length); c++) covered[c] = true;
  };
  const entries = groups.map((g, i): RowEntry => {
    cover(g.start, g.end);
    const span = spans[i];
    // The label and what stands between it and the link (spaces, a page word).
    if (span) cover(Math.min(span.from, g.end), Math.max(span.to, g.start));
    return {
      entry: {
        label: span ? cleanLabel(t.slice(span.from, span.to)) : '',
        target: g.first.target,
        linkText: t.slice(g.start, g.end).trim(),
      },
      column: Math.min(g.start, span?.from ?? g.start),
    };
  });
  const rest = [...t].map((ch, c) => (covered[c] ? ' ' : ch)).join('');
  return { entries, leftovers: pieces(rest) };
}

function entryLink(l: LinkSpan): EntryLink {
  return { text: l.text.trim(), target: l.target };
}

/**
 * Entries of a `name-link` row (`nameLinkRow` in classify.ts): one per name,
 * with every page number of that name as a link (`more`). A note after the
 * last number joins the last name (`Jalankulkusää (marras-huhtikuu)` → 418).
 * Text after a wide gap at the end is left over, for the entry above.
 */
function nameLinkEntries(line: ClassifiedLine): {
  entries: RowEntry[];
  leftovers: Leftover[];
  open: boolean;
} {
  const row = nameLinkRow(line.text, line.links);
  if (!row) return { ...rowEntries(line), open: false };
  const entries = row.parts.map((p, i): RowEntry => {
    const [first, ...more] = p.links;
    const note = i === row.parts.length - 1 && row.note ? ` ${row.note}` : '';
    const entry: LinkEntry = {
      label: cleanLabel(p.name + note),
      target: first.target,
      linkText: first.text.trim(),
    };
    if (more.length > 0) entry.more = more.map(entryLink);
    return { entry, column: p.column };
  });
  const leftovers = row.rest.filter((r) => /[\p{L}\d]/u.test(r.text));
  return { entries, leftovers, open: row.open };
}

/** The entry in the row above that a piece of text at `column` continues. */
function entryAbove(above: RowEntry[], column: number): RowEntry | undefined {
  let best: RowEntry | undefined;
  for (const e of above) if (e.column <= column) best = e;
  return best;
}

/** Leftover text that reads as the rest of the entry above. */
function readsAsContinuation(piece: string, entry: LinkEntry): boolean {
  return /^[\p{Ll}&]/u.test(piece) || /[-/&]$/.test(entry.label);
}

// ------------------------------------------------------------------ trends

/** A price change on its own: `+0,52`, `-11,70`, `+0,00`. */
const TREND_VALUE = /^[+-]\d+(?:,\d+)?$/;

/** A column label that says the table has change columns (`MUUTOS%`, `MUUTOS`). */
const CHANGE_LABEL = /\bMUUTOS/;

/**
 * The price changes Yle coloured on one table row, with columns of the row
 * as on screen (`line.text`). `line` in the result is left at 0 for the
 * builder to fill. Yellow `+…` is rising, cyan `-…` is falling (page 175's
 * note); a run whose colour and sign disagree is not marked.
 */
export function trendMarks(line: ClassifiedLine): TrendMark[] {
  const marks: TrendMark[] = [];
  for (const run of line.line.runs) {
    if (run.graphics || run.concealed) continue;
    const trend = run.fg === 'yellow' ? 'up' : run.fg === 'cyan' ? 'down' : undefined;
    if (trend === undefined) continue;
    // Two changes of the same colour come as one run (`+0,15  +30,82` on 184).
    const values = [...run.text.matchAll(/\S+/g)];
    const sign = trend === 'up' ? '+' : '-';
    if (values.length === 0) continue;
    if (!values.every(([v]) => TREND_VALUE.test(v) && v[0] === sign)) continue;
    for (const { 0: value, index } of values) {
      const column = run.column + index;
      // Only when the row still shows the value in those cells.
      if (line.text.slice(column, column + value.length) !== value) continue;
      marks.push({ line: 0, column, length: value.length, trend });
    }
  }
  return marks;
}

// ----------------------------------------------------------------- builder

class Builder {
  readonly blocks: ReaderBlock[] = [];
  private para: { segs: Seg[]; last: RowShape } | undefined;
  private heading: string | undefined;
  private table: string[] | undefined;
  /** A table with a column header (298) runs on across single blank rows. */
  private headed = false;
  private blanksInTable = 0;
  /** Column-label rows at the top of the current table. */
  private headerRows = 0;
  /** Coloured price changes of the current table, in row columns. */
  private trends: TrendMark[] = [];
  private list: LinkListBlock | undefined;
  /** Entries of the previous row, while it was a link row. */
  private above: { row: number; entries: RowEntry[] } | undefined;
  /** The last entry of an index row ending in `,` or `&`: its numbers go on below. */
  private open: { row: number; entry: LinkEntry } | undefined;

  /** End paragraphs, headings and tables; link lists survive blank rows. */
  private flushText(): void {
    if (this.para) {
      const segs = resolveLinks(this.para.segs);
      if (segs.length > 0) this.blocks.push({ kind: 'paragraph', segments: segs });
      this.para = undefined;
    }
    if (this.heading !== undefined) {
      if (this.heading) this.blocks.push({ kind: 'heading', text: this.heading });
      this.heading = undefined;
    }
    if (this.table) {
      const indent = Math.min(...this.table.filter((l) => l !== '').map((l) => l.search(/\S/)));
      const table: TableBlock = { kind: 'table', lines: this.table.map((l) => l.slice(indent)) };
      // A table of nothing but labels has no header to show above anything.
      if (this.headerRows > 0 && this.headerRows < this.table.length) {
        table.headerRows = this.headerRows;
        // Only tables that label a change column: a cyan `-3` elsewhere may be a cold temperature.
        const labels = this.table.slice(0, this.headerRows);
        if (this.trends.length > 0 && labels.some((l) => CHANGE_LABEL.test(l))) {
          table.trends = this.trends.map((m) => ({ ...m, column: m.column - indent }));
        }
      }
      this.blocks.push(table);
      this.table = undefined;
      this.headed = false;
      this.blanksInTable = 0;
      this.headerRows = 0;
      this.trends = [];
    }
  }

  private flushList(): void {
    if (this.list && this.list.entries.length > 0) this.blocks.push(this.list);
    this.list = undefined;
    this.above = undefined;
    this.open = undefined;
  }

  flush(): void {
    this.flushText();
    this.flushList();
  }

  push(block: ReaderBlock): void {
    this.flush();
    this.blocks.push(block);
  }

  blank(): void {
    // Single blank rows between the rows of a headed table keep the table whole;
    // a trailing one is dropped when the table ends.
    if (this.table && this.headed && this.blanksInTable === 0) {
      this.blanksInTable = 1;
      return;
    }
    this.flushText();
  }

  headingRow(line: ClassifiedLine): void {
    if (this.heading === undefined) this.flush();
    this.heading = joinWrapped(this.heading ?? '', line.text.replace(/\s+/g, ' ').trim());
  }

  tableRow(line: ClassifiedLine): void {
    if (!this.table) this.flush();
    if (this.blanksInTable > 0) this.table?.push('');
    this.blanksInTable = 0;
    if (line.rule === 'table-header') this.headed = true;
    const label = line.rule === 'table-header' || line.rule === 'band-header';
    if (label && this.headerRows === (this.table?.length ?? 0)) this.headerRows++;
    const index = this.table?.length ?? 0;
    if (!label) for (const m of trendMarks(line)) this.trends.push({ ...m, line: index });
    (this.table ??= []).push(line.text.trimEnd());
  }

  paragraphRow(line: ClassifiedLine): void {
    if (!this.para) this.flush();
    const shape = rowShape(line.text);
    const row = rowSegments(line);
    if (!this.para) {
      this.para = { segs: row, last: shape };
      return;
    }
    const soft = isSoftWrap(this.para.last, shape);
    if (!soft && endsSentence(this.para.last.text)) {
      this.flushText();
      this.para = { segs: row, last: shape };
      return;
    }
    this.para.segs = appendRow(this.para.segs, row, soft);
    this.para.last = shape;
  }

  linkRow(line: ClassifiedLine): void {
    this.flushText();
    const variant = line.rule === 'coloured-nav' ? 'bar' : 'list';
    const above = this.above && this.above.row === line.number - 1 ? this.above.entries : undefined;

    if (line.rule === 'continuation') {
      const ps = pieces(line.text);
      const rest = above ? this.attach(ps, above, true) : ps;
      for (const p of rest) this.standalone(p.text);
      if (this.above) this.above.row = line.number;
      return;
    }

    const open = this.open?.row === line.number - 1 ? this.open.entry : undefined;
    this.open = undefined;
    if (open && line.rule === 'link-only' && line.links.every((l) => l.target.kind !== 'url')) {
      // `359-360, 774-776` under `Yle Teema & Fem 305, 312, 317,` (198): more numbers of that entry.
      (open.more ??= []).push(...line.links.map(entryLink));
      if (/[,&]$/.test(line.text.trimEnd())) this.open = { row: line.number, entry: open };
      if (this.above) this.above.row = line.number;
      return;
    }

    if (this.list && this.list.variant !== variant) this.flushList();
    const {
      entries,
      leftovers,
      open: ends,
    } = line.rule === 'name-link' ? nameLinkEntries(line) : { ...rowEntries(line), open: false };
    const loose = above ? this.attach(leftovers, above, false) : leftovers;
    // Entries and loose text in column order; loose text splits the list.
    const items = [
      ...entries.map((e) => ({
        column: e.column,
        entry: e.entry as LinkEntry | undefined,
        text: '',
      })),
      ...loose.map((p) => ({ column: p.column, entry: undefined, text: p.text })),
    ].sort((a, b) => a.column - b.column);
    for (const item of items) {
      if (item.entry) {
        this.list ??= { kind: 'linkList', variant, entries: [] };
        this.list.entries.push(item.entry);
      } else {
        this.standalone(item.text);
      }
    }
    this.above = { row: line.number, entries };
    const last = entries.at(-1);
    if (ends && last) this.open = { row: line.number, entry: last.entry };
  }

  /** Append pieces to the entries above; returns the pieces that did not fit. */
  private attach(ps: Leftover[], above: RowEntry[], always: boolean): Leftover[] {
    const rest: Leftover[] = [];
    for (const p of ps) {
      const target = entryAbove(above, p.column) ?? (always ? above[0] : undefined);
      if (target && (always || readsAsContinuation(p.text, target.entry))) {
        const e = target.entry;
        e.label = e.label ? joinWrapped(e.label, p.text) : p.text;
      } else {
        rest.push(p);
      }
    }
    return rest;
  }

  /** Text on a link row that belongs to no entry: its own paragraph. */
  private standalone(t: string): void {
    const above = this.above;
    this.flushList();
    this.blocks.push({ kind: 'paragraph', segments: [text(t)] });
    this.above = above;
  }
}

// --------------------------------------------------------- repeated rows

function isLinkRow(line: ClassifiedLine): boolean {
  return line.kind === 'headline' || line.kind === 'nav';
}

/**
 * Row numbers of link rows that every subpage repeats unchanged (same row,
 * same text, a `headline` or `nav` row on each). Empty for a page with one
 * subpage. `toReaderBlocks` keeps these rows on subpage 1 only.
 */
export function repeatedRows(subpages: readonly ClassifiedSubpage[]): Set<number> {
  const out = new Set<number>();
  if (subpages.length < 2) return out;
  const byNumber = subpages.map((sp) => new Map(sp.lines.map((l) => [l.number, l])));
  for (const first of subpages[0].lines) {
    if (!isLinkRow(first) || first.text.trim() === '') continue;
    const same = byNumber.every((rows) => {
      const l = rows.get(first.number);
      return l !== undefined && isLinkRow(l) && l.text === first.text;
    });
    if (same) out.add(first.number);
  }
  return out;
}

/**
 * Row numbers, per subpage index, of closing text rows that an earlier subpage
 * closed with as well: the subpage's last run of `paragraph` or `page-ref` rows (up to a
 * blank row or any other kind) has the same row numbers and text as that of an
 * earlier subpage. Only whole runs count, so a sentence in the middle of an
 * article is never cut. The first subpage keeps its footer.
 */
export function repeatedFooters(subpages: readonly ClassifiedSubpage[]): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const seen = new Set<string>();
  subpages.forEach((sp, i) => {
    const run: ClassifiedLine[] = [];
    for (let j = sp.lines.length - 1; j >= 0; j--) {
      const line = sp.lines[j];
      if (line.kind === 'blank' || (line.kind === 'drop' && run.length === 0)) continue;
      if (line.kind !== 'paragraph' && line.rule !== 'page-ref') break;
      run.unshift(line);
    }
    if (run.length === 0) return;
    const key = run.map((l) => `${l.number}:${l.text.trim()}`).join('\n');
    if (seen.has(key)) out.set(i, new Set(run.map((l) => l.number)));
    seen.add(key);
  });
  return out;
}

// --------------------------------------------------------- contact lines

/**
 * `yle.uutiset@yle.fi`, or `nyheter(a)yle.fi` as 799 writes it. `(?:^|[^…])`
 * starts the match only where the name starts, not at each of its letters.
 */
const EMAIL = /(?:^|[^\p{L}\d._%+-])[\p{L}\d._%+-]+(?:@|\(a\))[\p{L}\d-]+(?:\.[\p{L}\d-]+)+/u;
/** A phone or fax word, a post-office box (`PL 24`, `PB 5`) or a postcode (`00024`). */
const PHONE_OR_POST =
  /(?:^|[^\p{L}])(?:puh(?:elin)?|tel(?:efon)?|fax|faksi)(?![\p{L}])|(?:^|\s)(?:PL|PB)\s?\d+|(?:^|\s)\d{5}(?=[\s,]|$)/iu;

function hasEmail(line: ClassifiedLine): boolean {
  return (
    EMAIL.test(line.text) ||
    line.links.some((l) => l.target.kind === 'url' && l.target.href.startsWith('mailto:'))
  );
}

/**
 * A row that can be part of a contact stretch: text or table rows, and link
 * rows whose links are all web or e-mail links (`yle.fi/uutiset` on 101).
 */
function contactCandidate(line: ClassifiedLine): boolean {
  if (line.kind === 'paragraph' || line.kind === 'table') return true;
  return isLinkRow(line) && line.links.every((l) => l.target.kind === 'url');
}

/**
 * Row numbers of the subpage's contact lines (see the rule list at the top):
 * a run of `contactCandidate` rows with an e-mail address and a phone number
 * or postal address, on a subpage whose other rows are all link rows (or
 * blank, decoration, title). Empty when there is none.
 */
export function contactRows(sp: ClassifiedSubpage): Set<number> {
  const out = new Set<number>();
  let run: ClassifiedLine[] = [];
  const endRun = () => {
    if (run.some(hasEmail) && run.some((l) => PHONE_OR_POST.test(l.text))) {
      for (const l of run) out.add(l.number);
    }
    run = [];
  };
  for (const line of sp.lines) {
    if (contactCandidate(line)) run.push(line);
    else endRun();
  }
  endRun();
  if (out.size === 0) return out;
  const indexPage = sp.lines.every(
    (l) =>
      out.has(l.number) ||
      isLinkRow(l) ||
      l.kind === 'blank' ||
      l.kind === 'drop' ||
      l.kind === 'title',
  );
  return indexPage ? out : new Set();
}

/** One contact row as segments: web and e-mail links kept, every space run one space. */
function contactLine(line: ClassifiedLine): InlineSegment[] {
  const segs: Seg[] = [];
  let at = 0;
  for (const l of line.links) {
    if (l.target.kind !== 'url' || l.column < at) continue;
    segs.push(text(line.text.slice(at, l.column)));
    segs.push({ kind: 'link', text: l.text.trim(), target: l.target });
    at = l.column + l.length;
  }
  segs.push(text(line.text.slice(at)));
  const tidy = segs.map((s) => (s.kind === 'text' ? text(s.text.replace(/\s+/g, ' ')) : s));
  const first = tidy[0];
  const last = tidy[tidy.length - 1];
  if (first.kind === 'text') first.text = first.text.trimStart();
  if (last.kind === 'text') last.text = last.text.trimEnd();
  return mergeText(tidy);
}

// ------------------------------------------------------ sorted link lists

/**
 * Pages whose links are shown as one list in page-number order. An owner
 * decision per page (M3.24): 101, Yle's news contents page, where reading the
 * two teletext columns across gave a jumbled order.
 */
export const SORTED_LINK_PAGES: ReadonlySet<number> = new Set([101]);

function isList(b: ReaderBlock): b is LinkListBlock {
  return b.kind === 'linkList' && b.variant === 'list';
}

/** The page an entry opens, for sorting; web links go last. */
function sortKey(target: ReaderLink): number {
  if (target.kind === 'page') return target.page;
  if (target.kind === 'range') return target.from;
  return Number.POSITIVE_INFINITY;
}

/** One subpage's blocks with all `list` entries merged and sorted (stable). */
function sortSubpageLinks(bs: ReaderBlock[]): ReaderBlock[] {
  const first = bs.findIndex(isList);
  if (first < 0) return bs;
  let last = first;
  bs.forEach((b, i) => {
    if (isList(b)) last = i;
  });
  const span = bs.slice(first, last + 1);
  const entries = span
    .filter(isList)
    .flatMap((l) => l.entries)
    .sort((a, b) => sortKey(a.target) - sortKey(b.target));
  const list: LinkListBlock = { kind: 'linkList', variant: 'list', entries };
  return [...bs.slice(0, first), ...span.filter((b) => !isList(b)), list, ...bs.slice(last + 1)];
}

/** `sortSubpageLinks` on each subpage of a block stream. */
export function sortLinkLists(blocks: readonly ReaderBlock[]): ReaderBlock[] {
  const out: ReaderBlock[] = [];
  let part: ReaderBlock[] = [];
  for (const b of blocks) {
    if (b.kind !== 'subpageDivider') {
      part.push(b);
      continue;
    }
    out.push(...sortSubpageLinks(part), b);
    part = [];
  }
  out.push(...sortSubpageLinks(part));
  return out;
}

// ------------------------------------------------------------ bar first

/**
 * Pages whose bottom bar of buttons is shown at the top instead. 200 (Urheilu)
 * is the sports front: its bar, `UUTISET` (the headlines, 201) and `PALLOILU`
 * (220), is how a reader gets to the news, and at the bottom of a long list
 * of leagues it went unseen. Other index pages keep Yle's order.
 */
export const BAR_FIRST_PAGES: ReadonlySet<number> = new Set([200]);

/** On each subpage, move the `bar` link lists to the top (after a title). */
export function barsFirst(blocks: readonly ReaderBlock[]): ReaderBlock[] {
  const isBar = (b: ReaderBlock) => b.kind === 'linkList' && b.variant === 'bar';
  const out: ReaderBlock[] = [];
  let part: ReaderBlock[] = [];
  const endPart = () => {
    const titles = part.filter((b) => b.kind === 'title');
    const rest = part.filter((b) => b.kind !== 'title');
    out.push(...titles, ...rest.filter(isBar), ...rest.filter((b) => !isBar(b)));
    part = [];
  };
  for (const b of blocks) {
    if (b.kind === 'subpageDivider') {
      endPart();
      out.push(b);
    } else {
      part.push(b);
    }
  }
  endPart();
  return out;
}

// ------------------------------------------------------------ column pages

/**
 * Pages Yle sets as two 20-cell columns that read top to bottom, left column
 * first (the TV and radio index 300: today / tomorrow / the day after, with
 * their channels). Reading the rows across mixed the columns up (M3.35).
 * A page list, like `SORTED_LINK_PAGES`: other index pages (199, 200, 575)
 * group their sections across the rows.
 */
export const COLUMN_PAGES: ReadonlySet<number> = new Set([300]);

const COLUMN_SPLIT = 20;

/** Half of a row: the other half's cells blanked and its links dropped. */
function half(line: ClassifiedLine, side: 'left' | 'right', prev: ClassifiedLine | undefined) {
  const keep = (c: number) => (side === 'left' ? c < COLUMN_SPLIT : c >= COLUMN_SPLIT);
  const text = [...line.text].map((ch, c) => (keep(c) ? ch : ' ')).join('');
  const links = line.links.filter((l) => keep(l.column));
  const base = { ...line, text, links };
  if (text.trim() === '') return { ...base, kind: 'blank' as const, rule: 'blank' as const };
  if (links.length > 0) return base;
  // Text without a link: the rest of the entry above, or a section label.
  if (prev && prev.kind !== 'blank' && prev.links.length > 0) {
    return { ...base, kind: 'nav' as const, rule: 'continuation' as const };
  }
  return { ...base, kind: 'heading' as const, rule: 'text' as const };
}

/** A row whose text or link runs across the middle belongs to neither column. */
function crossesMiddle(line: ClassifiedLine): boolean {
  if (line.rule === 'coloured-nav') return true;
  return (
    line.kind !== 'drop' &&
    line.text.length > COLUMN_SPLIT &&
    line.text[COLUMN_SPLIT - 1] !== ' ' &&
    line.text[COLUMN_SPLIT] !== ' '
  );
}

/**
 * Rows of a column page in reading order: each band between full-width rows
 * (`Aakkosellinen hakemisto` on 300) gives its left column, then its right.
 * A `blank` row between the columns ends the list of the left one.
 */
export function inColumns(lines: readonly ClassifiedLine[]): ClassifiedLine[] {
  const out: ClassifiedLine[] = [];
  let left: ClassifiedLine[] = [];
  let right: ClassifiedLine[] = [];
  const blank = (number: number): ClassifiedLine => ({
    ...lines[0],
    number,
    kind: 'blank',
    rule: 'blank',
    text: '',
    links: [],
  });
  const endBand = () => {
    if (left.length > 0) out.push(...left, blank(0), ...right, blank(0));
    left = [];
    right = [];
  };
  for (const line of lines) {
    if (line.kind === 'drop' || crossesMiddle(line)) {
      endBand();
      out.push(line);
      continue;
    }
    left.push(half(line, 'left', left.at(-1)));
    right.push(half(line, 'right', right.at(-1)));
  }
  endBand();
  return out;
}

// ------------------------------------------------------- hidden link entries

/**
 * Entries left out of a page's link lists, by page number (owner decision
 * 2026-10-25, RP.3). 400 (Sää ja liikenne) also lists `460 RAVIT` and
 * `470 VEIKKAUSSIVUT`, which are neither weather nor traffic. 470 stays in the
 * menu; 460 is reachable by page number. This leaves out a whole entry and
 * never rewords one.
 */
export const HIDDEN_LINK_PAGES: ReadonlyMap<number, ReadonlySet<number>> = new Map([
  [400, new Set([460, 470])],
]);

/** The link lists without entries that open one of `hidden`; empty lists go. */
export function withoutLinks(
  blocks: readonly ReaderBlock[],
  hidden: ReadonlySet<number>,
): ReaderBlock[] {
  const opensHidden = (t: ReaderLink) =>
    (t.kind === 'page' && hidden.has(t.page)) || (t.kind === 'range' && hidden.has(t.from));
  const out: ReaderBlock[] = [];
  for (const b of blocks) {
    if (b.kind !== 'linkList') {
      out.push(b);
      continue;
    }
    const entries = b.entries.filter((e) => !opensHidden(e.target));
    if (entries.length > 0) out.push(entries.length === b.entries.length ? b : { ...b, entries });
  }
  return out;
}

// --------------------------------------------------------- letter headings

/**
 * Pages in alphabetical order whose letter groups Yle marks with a big letter
 * drawn in mosaic graphics in the left margin: the alphabetical index 196-198
 * (Aakkosellinen hakemisto). Graphics are not text, so the letter is the first
 * letter of the group's entries, which is what the drawn letter shows. A page
 * list, like `SORTED_LINK_PAGES`: on other pages a change of first letter
 * means nothing.
 */
export const LETTER_HEADING_PAGES: ReadonlySet<number> = new Set([196, 197, 198]);

/** `A` for `Aamu-tv:n aiheet 399`, `K` for `"Kirkasvalosivu" 579`; none for `pohjoissaami 520`. */
function initialOf(line: ClassifiedLine): string | undefined {
  return /^\s*["'«(]?(\p{Lu})/u.exec(line.text)?.[1];
}

export interface ReaderBlockOptions {
  /**
   * A heading with the letter before each letter group of `name-link`
   * entries, and at the top of each subpage. Defaults to `true` for
   * `LETTER_HEADING_PAGES` and `false` elsewhere.
   */
  letterHeadings?: boolean;
  /**
   * Leave out the entries in `HIDDEN_LINK_PAGES` (default `true`). Tests turn
   * it off to check that nothing else is lost.
   */
  hideLinks?: boolean;
  /**
   * Keep link rows that every subpage repeats on every subpage (default
   * `false`: they are shown once, on subpage 1). Used by tests to compare.
   */
  keepRepeatedRows?: boolean;
  /**
   * Show the page's links as one list in page-number order. Defaults to
   * `true` for `SORTED_LINK_PAGES` and `false` elsewhere.
   */
  sortLinks?: boolean;
  /**
   * Read the page's two columns top to bottom. Defaults to `true` for
   * `COLUMN_PAGES` and `false` elsewhere. Tests turn it off to compare.
   */
  columns?: boolean;
}

/**
 * Turn a normalised page into reader blocks. `subpages` defaults to
 * `classify(page)`; pass it when you already have it.
 */
export function toReaderBlocks(
  page: Page,
  classified: ClassifiedSubpage[] = classify(page),
  options: ReaderBlockOptions = {},
): ReaderBlock[] {
  // The stamp is shown in the meta line (`pageStamp`), not as a title.
  const stamp = pageStamp(classified);
  const subpages = stamp ? withoutStamp(classified, stamp) : classified;
  const titles = subpages.map((sp) => subpageTitles(sp, page.name, stamp?.row));
  // Subpage 1's own title rows, before a varying header name is added below.
  const firstTitles = [...titles[0]];
  const common =
    subpages.length > 1 ? titles[0].filter((t) => titles.every((ts) => ts.includes(t))) : [];
  const repeated = options.keepRepeatedRows ? new Set<number>() : repeatedRows(subpages);
  const footers = options.keepRepeatedRows
    ? new Map<number, Set<number>>()
    : repeatedFooters(subpages);
  // A name that changes from subpage to subpage tells the reader which board is which.
  // Only on table pages: an article's header row (725: the weekday) is not a board name.
  const names = subpages.map((sp) =>
    sp.lines.some((l) => l.kind === 'table') ? headerName(sp) : undefined,
  );
  const varying = new Set(names.filter((n) => n !== undefined)).size > 1;
  if (varying) {
    names.forEach((n, i) => {
      // Named in the divider where it changes, not again while it stays the same.
      if (
        n !== undefined &&
        (i === 0 || n !== names[i - 1]) &&
        !titles[i].some((t) => lettersOnly(t) === lettersOnly(n))
      ) {
        titles[i].unshift(n);
      }
    });
  }

  const b = new Builder();
  const letterHeadings = options.letterHeadings ?? LETTER_HEADING_PAGES.has(page.number);
  subpages.forEach((sp, i) => {
    b.flush();
    const contacts = contactRows(sp);
    // Yle draws the letter again at the top of each subpage; entries in lower
    // case there (`pohjoissaami 520` on 197/3) take the subpage's first letter.
    const nameLinks = sp.lines.filter((l) => l.rule === 'name-link');
    const firstLetter = nameLinks.map(initialOf).find((l) => l !== undefined);
    let letter: string | undefined;
    if (i > 0) {
      b.push({
        kind: 'subpageDivider',
        number: sp.number,
        count: subpages.length,
        titles: titles[i].filter((t) => !common.includes(t)),
      });
    }
    const name = names[i];
    if (
      i === 0 &&
      varying &&
      name !== undefined &&
      !firstTitles.some((t) => lettersOnly(t) === lettersOnly(name))
    ) {
      b.push({ kind: 'title', text: name });
    }
    const columns = options.columns ?? COLUMN_PAGES.has(page.number);
    const footer = footers.get(i);
    // Subpage 1's titles go out together where its first title row is, so a
    // title wrapped over two rows (187) or split off a header row (176) is one.
    let titlesShown = i > 0;
    const showTitles = (line: ClassifiedLine) => {
      if (titlesShown || (line.kind !== 'title' && line.title === undefined)) return;
      titlesShown = true;
      for (const t of firstTitles) b.push({ kind: 'title', text: t });
    };
    for (const line of columns ? inColumns(sp.lines) : sp.lines) {
      if (footer?.has(line.number)) {
        // Shown under an earlier subpage already.
        b.blank();
        continue;
      }
      if (i > 0 && repeated.has(line.number)) {
        // Shown on subpage 1 already. Acts as a break, so the text above and
        // below it is not joined into one paragraph.
        b.blank();
        continue;
      }
      if (contacts.has(line.number)) {
        // Shown in the contact block at the end of the subpage.
        b.blank();
        continue;
      }
      switch (line.kind) {
        case 'drop':
          if (line.rule !== 'double-height-copy' && line.rule !== 'header-row') b.blank();
          break;
        case 'blank':
          // A column's groups are separate lists; elsewhere a list runs on.
          if (columns) b.flush();
          else b.blank();
          break;
        case 'title':
          showTitles(line);
          break;
        case 'heading':
          b.headingRow(line);
          break;
        case 'paragraph':
          b.paragraphRow(line);
          break;
        case 'table':
          showTitles(line);
          b.tableRow(line);
          break;
        case 'headline':
        case 'nav':
          if (letterHeadings && line.rule === 'name-link') {
            const l = initialOf(line) ?? (letter === undefined ? firstLetter : undefined);
            if (l !== undefined && l !== letter) {
              b.push({ kind: 'heading', text: l });
              letter = l;
            }
          }
          b.linkRow(line);
          break;
      }
    }
    if (contacts.size > 0) {
      b.push({
        kind: 'contact',
        lines: sp.lines.filter((l) => contacts.has(l.number)).map(contactLine),
      });
    }
  });
  b.flush();
  const sort = options.sortLinks ?? SORTED_LINK_PAGES.has(page.number);
  const hidden = HIDDEN_LINK_PAGES.get(page.number);
  const shown = hidden && (options.hideLinks ?? true) ? withoutLinks(b.blocks, hidden) : b.blocks;
  const sorted = sort ? sortLinkLists(shown) : shown;
  return BAR_FIRST_PAGES.has(page.number) ? barsFirst(sorted) : sorted;
}
