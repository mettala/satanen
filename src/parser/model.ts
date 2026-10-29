/**
 * The normalised teletext page model: Page → Subpage → Line → Run.
 *
 * Built by `normalize()` from Yle's raw JSON. Every later parser step (line
 * classification, reader blocks, tables) reads this model and never the raw
 * JSON. Text is kept exactly as Yle sent it: no trimming, no whitespace
 * collapsing, because tables depend on column positions and the licence
 * forbids changing the content.
 *
 * Quirks of the raw API and how they map to this model are listed in
 * docs/YLE-API.md under "Quirks seen in fixtures".
 */

/** The eight teletext colours. */
export const COLOURS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
] as const;
export type Colour = (typeof COLOURS)[number];

/** Width of a teletext row in character cells. */
export const LINE_WIDTH = 40;
/** Rows are numbered 1..MAX_LINE in the API. */
export const MAX_LINE = 24;

/**
 * Where a link run points.
 * - `page`: another teletext page, e.g. `"105"` → 105.
 * - `url`: a web or e-mail address (`https://…`, `http://…`, `mailto:…`).
 *   The run's text usually omits the scheme (`yle.fi/tekstitv`).
 * - `other`: anything else Yle marked as a link (seen: `">>>"` on page 199,
 *   the TV's "next subpage" arrow). Kept so nothing is lost; `classify` drops it.
 */
export type LinkTarget =
  { kind: 'page'; page: number } | { kind: 'url'; href: string } | { kind: 'other'; raw: string };

/** A stretch of cells on one line that share the same attributes. */
export interface Run {
  /**
   * The cells' characters, exactly as sent. When Yle omits `Text` (blank
   * cells, double-height companion rows) this is `length` spaces, so joining
   * a line's runs always keeps every column in place.
   */
  text: string;
  /** False when Yle sent no `Text` for this run (the cells are blank). */
  hasText: boolean;
  /** 0-based column where the run starts (sum of earlier runs' lengths). */
  column: number;
  /** Number of cells the run covers. */
  length: number;
  /** Foreground colour, without the graphics `g` prefix. */
  fg: Colour;
  /** Background colour. */
  bg: Colour;
  /**
   * Mosaic graphics (Yle sent `gwhite`, `gblue`…; note plain `green` is NOT
   * graphics). The text is mosaic codes like `####` or `ppp`, not words,
   * except for digits Yle sometimes puts inside graphics (page 890).
   */
  graphics: boolean;
  /**
   * Yle sent these cells as plain text in `structured`, but the row's `all`
   * content shows them in graphics mode (891's big date and sun picture,
   * docs/YLE-API.md quirk 28). normalize splits such a run and marks the
   * mosaic part `graphics: true` with this flag; it has no `charcode`.
   */
  graphicsFromAll?: true;
  /** Yle's mosaic character code (e.g. `"7Fh"`); only on graphics runs. */
  charcode?: string;
  /**
   * Concealed cells (Yle sent `conceal: "true"`): a TV hides them until the
   * viewer presses "reveal". On the fund pages 181-187 they hold `sn`, where
   * Yle's page image shows the subpage counter (`1/16`). Not text to read
   * (docs/YLE-API.md quirk 29).
   */
  concealed?: true;
  /** Double-height cell (a headline). The next line repeats it without text. */
  doubleHeight: boolean;
  /** Present when Yle marked this run as a link. */
  link?: LinkTarget;
}

export interface Line {
  /** Row number, 1..24. */
  number: number;
  /** Runs in left-to-right order. Never empty for real pages. */
  runs: Run[];
  /** All runs' text joined: the row as it appears on screen. At most 40 characters. */
  text: string;
  /**
   * Text Yle sent past the 40th column, cut off `text` (a run whose `Text` is
   * longer than its `length`). Only set when it holds more than spaces; never
   * seen in a real page. The subpage then falls back to Yle's page image
   * (confidence reason `oversized-row`), so the reader still sees everything.
   */
  overflow?: string;
}

export interface Subpage {
  /** 1-based subpage number. */
  number: number;
  /** How long a TV shows this subpage before rotating, in seconds. */
  displaySeconds?: number;
  /** Rows sorted by number. Yle sends all 24 rows, blank ones included. */
  lines: Line[];
}

export interface Page {
  /** Page number, e.g. 100. */
  number: number;
  /** Page name such as "Uutiset". Often empty (`""`): most pages have no name. */
  name: string;
  /** Subpages sorted by number; always at least one. */
  subpages: Subpage[];
  /** Number of subpages (equals `subpages.length`). */
  subpageCount: number;
  /** Previous / next page in Yle's ordering. Page 100 has no previous page. */
  prevPage?: number;
  nextPage?: number;
  /** Last-modified time in Finnish local time, as sent: `"2026-10-21T05:26:37"`. */
  time?: string;
  /** Last-modified time as an ISO UTC instant: `"2026-10-21T02:26:37Z"`. */
  updatedAt?: string;
  /**
   * Yle's page type: `"normal"`, `"group"` or `"block"`. Not reliable: the main
   * index 199 is `"normal"`, TV guides 301/302 are `"group"` (docs/YLE-API.md).
   */
  topType?: string;
  /** True when Yle flags the page as rotating subpages on TV (page 100). */
  animated: boolean;
  /**
   * Things the normaliser had to guess or skip (unknown colour, odd field).
   * Empty for every captured fixture; useful for spotting API changes.
   */
  warnings: string[];
}

export type NormalizeErrorKind =
  /** Not a teletext page response at all (e.g. a 404 body). */
  | 'not-a-page'
  /** Looks like a page but has no usable subpage content. */
  | 'no-content';

export type NormalizeResult =
  { ok: true; page: Page } | { ok: false; error: { kind: NormalizeErrorKind; message: string } };
