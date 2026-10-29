/**
 * Layer 1 of the parser: Yle's raw teletext JSON → the typed `Page` model.
 *
 * Pure function, never throws. It only reshapes: arrays vs single objects,
 * numbers sent as strings, missing fields. It never edits text, with one
 * exception: a row is cut at the 40-column teletext width, and the cut-off
 * text is kept in `Line.overflow` (never seen in a real page). Anything it
 * has to guess goes into `page.warnings`.
 *
 * Runs come from Yle's `structured` content. The `all` content is only used
 * to find mosaic cells that `structured` sent as plain text (891, 420, 700,
 * 799, 890): such a run is split, never edited (see `markHiddenGraphics`).
 */
import {
  COLOURS,
  LINE_WIDTH,
  MAX_LINE,
  type Colour,
  type Line,
  type LinkTarget,
  type NormalizeResult,
  type Page,
  type Run,
  type Subpage,
} from './model';
import { mosaicCells } from './graphicsMode';

type Obj = Record<string, unknown>;

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Yle sends a single object instead of a one-item array; missing → []. */
function asArray(x: unknown): unknown[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Whole numbers ≥ 0 arrive as strings ("103"); accept real numbers too.
 * Negatives, fractions, NaN and Infinity count as missing: every number Yle
 * sends (page, subpage, row, length, seconds) is a count or an id, and a
 * negative `length` made `' '.repeat` throw, which failed the whole page.
 */
function toInt(x: unknown): number | undefined {
  if (typeof x === 'number') return Number.isInteger(x) && x >= 0 ? x : undefined;
  if (typeof x === 'string' && /^\s*\d+\s*$/.test(x)) return Number.parseInt(x, 10);
  return undefined;
}

function toStr(x: unknown): string | undefined {
  if (typeof x === 'string') return x;
  if (typeof x === 'number') return String(x);
  return undefined;
}

function isColour(x: string): x is Colour {
  return (COLOURS as readonly string[]).includes(x);
}

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function parseLink(raw: unknown): LinkTarget | undefined {
  const s = toStr(raw)?.trim();
  if (!s) return undefined;
  if (/^\d{3}$/.test(s)) return { kind: 'page', page: Number.parseInt(s, 10) };
  if (/^(https?|mailto):/i.test(s)) return { kind: 'url', href: s };
  return { kind: 'other', raw: s };
}

function normalizeRun(
  raw: unknown,
  column: number,
  where: string,
  warn: (m: string) => void,
): Run | undefined {
  // A run is only ever skipped when its width is unknown (not an object, or
  // neither `length` nor `Text`). Any run whose width is known is kept, even
  // with odd colours or sizes, so the runs after it keep their columns.
  if (!isObj(raw)) {
    warn(`${where}: run is not an object, skipped`);
    return undefined;
  }
  const textRaw = toStr(raw.Text);
  let length = toInt(raw.length);
  if (length === undefined) {
    // Present but unusable (-5, 2.5, "abc"): treated like a missing length.
    const what = raw.length === undefined ? 'no length' : 'a bad length (not a whole number ≥ 0)';
    if (textRaw === undefined) {
      warn(
        raw.length === undefined
          ? `${where}: run has neither length nor Text, skipped`
          : `${where}: run has ${what} and no Text, skipped`,
      );
      return undefined;
    }
    warn(`${where}: run has ${what}, used Text length`);
    length = textRaw.length;
  }
  // A run never reaches past the 40th column. Without this cap a bad
  // `length` ("50000000") would build a line of that many spaces below.
  const room = LINE_WIDTH - column;
  if (length > room) {
    warn(`${where}: length ${length} reaches past column ${LINE_WIDTH}, cut to ${room}`);
    length = room;
  }
  let text = textRaw;
  if (textRaw !== undefined && textRaw.length !== length) {
    warn(`${where}: Text is ${textRaw.length} chars but length is ${length}`);
    // Too short: pad with spaces so later runs stay in their columns.
    // Too long: keep it whole here; normalizeLine cuts the row at 40 columns
    // and keeps what it cuts in `Line.overflow`.
    if (textRaw.length < length) text = textRaw.padEnd(length, ' ');
  }

  // fg: plain colour, or `g` + colour for mosaic graphics. Plain "green"
  // starts with g too, so match the whole name, never just the first letter.
  let fg: Colour = 'white';
  let graphics = false;
  const fgRaw = toStr(raw.fg)?.trim().toLowerCase() ?? '';
  if (isColour(fgRaw)) {
    fg = fgRaw;
  } else if (fgRaw.startsWith('g') && isColour(fgRaw.slice(1))) {
    fg = fgRaw.slice(1) as Colour;
    graphics = true;
  } else {
    warn(`${where}: unknown fg "${fgRaw}", used white`);
  }

  let bg: Colour = 'black';
  const bgRaw = toStr(raw.bg)?.trim().toLowerCase() ?? '';
  if (isColour(bgRaw)) bg = bgRaw;
  else warn(`${where}: unknown bg "${bgRaw}", used black`);

  // Only "double height" is seen in fixtures. Teletext also has "double size"
  // (double width and height); it takes two rows the same way, so treat it as
  // double height but warn, since it has never been seen.
  const size = toStr(raw.size)?.trim().toLowerCase();
  const doubleHeight = size === 'double height' || size === 'double size';
  if (size === 'double size') warn(`${where}: size "double size" treated as double height`);
  else if (size && !doubleHeight) warn(`${where}: unknown size "${size}", treated as normal`);

  const run: Run = {
    text: text ?? ' '.repeat(length),
    hasText: textRaw !== undefined,
    column,
    length,
    fg,
    bg,
    graphics,
    doubleHeight,
  };
  const charcode = toStr(raw.charcode);
  if (charcode !== undefined) run.charcode = charcode;
  // Concealed cells (quirk 29): hidden on a TV until the viewer presses "reveal".
  if (toStr(raw.conceal)?.trim().toLowerCase() === 'true') run.concealed = true;
  const link = parseLink(raw.link);
  if (link) run.link = link;
  return run;
}

/**
 * Split runs that Yle sent as plain text but whose cells `all` shows in
 * graphics mode (RP.8, quirk 28; see graphicsMode.ts). A run is only split
 * when it holds a real mosaic character, not just spaces; each piece keeps
 * every attribute, and the graphics pieces get `graphics: true`. Nothing is
 * changed when a run's `Text` is not its `length`, since the cells would not
 * line up with `all`.
 */
function markHiddenGraphics(runs: Run[], mosaic: boolean[]): Run[] {
  if (runs.some((r) => r.text.length !== r.length)) return runs;
  return runs.flatMap((run) => {
    if (run.graphics) return [run];
    const flags = Array.from({ length: run.length }, (_, i) => mosaic[run.column + i] === true);
    if (!flags.some((f, i) => f && run.text[i] !== ' ')) return [run];
    const pieces: Run[] = [];
    let start = 0;
    for (let i = 1; i <= run.length; i++) {
      if (i < run.length && flags[i] === flags[start]) continue;
      const piece: Run = {
        ...run,
        text: run.text.slice(start, i),
        column: run.column + start,
        length: i - start,
      };
      if (flags[start]) {
        piece.graphics = true;
        piece.graphicsFromAll = true;
      }
      pieces.push(piece);
      start = i;
    }
    return pieces;
  });
}

function normalizeLine(
  raw: unknown,
  where: string,
  warn: (m: string) => void,
  allRows: ReadonlyMap<number, string>,
): Line | undefined {
  if (!isObj(raw)) {
    warn(`${where}: line is not an object, skipped`);
    return undefined;
  }
  const number = toInt(raw.number);
  if (number === undefined || number < 1 || number > MAX_LINE) {
    warn(`${where}: line number ${JSON.stringify(raw.number)} out of range, skipped`);
    return undefined;
  }
  const runs: Run[] = [];
  const cut: string[] = [];
  // `column` counts cells by `length`; `width` counts characters of text so
  // far, which runs ahead of `column` when a `Text` is longer than its length.
  let column = 0;
  let width = 0;
  asArray(raw.run).forEach((r, i) => {
    const at = `${where} L${number} run${i + 1}`;
    const run = normalizeRun(r, column, at, warn);
    if (!run) return;
    // A teletext row is 40 cells. Text past that is cut off the row (a row
    // thousands of characters long froze the app) but kept in `overflow`.
    // Widths are UTF-16 units: an emoji or a decomposed `ä` counts as 2, so
    // a full row of them is cut early and falls back to the picture. Safe,
    // and Yle only sends precomposed BMP letters (every fixture).
    const room = LINE_WIDTH - width;
    if (run.text.length > room) {
      cut.push(run.text.slice(room));
      run.text = run.text.slice(0, room);
      if (run.text === '') {
        warn(`${at}: starts past column ${LINE_WIDTH}, skipped`);
        return;
      }
    }
    runs.push(run);
    column += run.length;
    width += run.text.length;
  });
  const text = runs.map((r) => r.text).join('');
  const all = allRows.get(number);
  const mosaic = all === undefined ? undefined : mosaicCells(all, text);
  const line: Line = { number, runs: mosaic ? markHiddenGraphics(runs, mosaic) : runs, text };
  const overflow = cut.join('');
  if (overflow !== '') {
    warn(
      `${where} L${number}: row is longer than ${LINE_WIDTH} columns, cut ${JSON.stringify(overflow)}`,
    );
    if (overflow.trim() !== '') line.overflow = overflow;
  }
  return line;
}

/** Row number → `Text` of Yle's `all` content. Missing or odd rows are left out. */
function allContentRows(all: unknown): Map<number, string> {
  const rows = new Map<number, string>();
  if (!isObj(all)) return rows;
  for (const l of asArray(all.line)) {
    if (!isObj(l)) continue;
    const number = toInt(l.number);
    const text = toStr(l.Text);
    if (number !== undefined && text !== undefined) rows.set(number, text);
  }
  return rows;
}

function normalizeSubpage(
  raw: unknown,
  index: number,
  warn: (m: string) => void,
): Subpage | undefined {
  if (!isObj(raw)) {
    warn(`subpage ${index + 1}: not an object, skipped`);
    return undefined;
  }
  let number = toInt(raw.number);
  if (number === undefined) {
    warn(`subpage ${index + 1}: no number, used position`);
    number = index + 1;
  }
  const where = `sp${number}`;
  // `content` holds three versions of the same rows: "text", "all" and
  // "structured". Only "structured" keeps colours, links and sizes; "all"
  // keeps the control codes, which tell graphics cells `structured` lost.
  const content = asArray(raw.content);
  const structured = content.find((c) => isObj(c) && c.type === 'structured');
  if (!isObj(structured)) {
    warn(`${where}: no structured content, skipped`);
    return undefined;
  }
  const allRows = allContentRows(content.find((c) => isObj(c) && c.type === 'all'));
  const lines = asArray(structured.line)
    .map((l) => normalizeLine(l, where, warn, allRows))
    .filter((l): l is Line => l !== undefined)
    .sort((a, b) => a.number - b.number);

  const subpage: Subpage = { number, lines };
  const seconds = toInt(raw.time);
  if (seconds !== undefined) subpage.displaySeconds = seconds;
  return subpage;
}

function normalizePage(input: unknown): NormalizeResult {
  const teletext = isObj(input) ? input.teletext : undefined;
  const raw = isObj(teletext) ? teletext.page : undefined;
  if (!isObj(raw)) {
    return { ok: false, error: { kind: 'not-a-page', message: 'No teletext.page object' } };
  }
  const number = toInt(raw.number);
  if (number === undefined) {
    return { ok: false, error: { kind: 'not-a-page', message: 'Page has no number' } };
  }

  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);

  const subpages = asArray(raw.subpage)
    .map((s, i) => normalizeSubpage(s, i, warn))
    .filter((s): s is Subpage => s !== undefined)
    .sort((a, b) => a.number - b.number);
  if (subpages.length === 0) {
    return {
      ok: false,
      error: { kind: 'no-content', message: `Page ${number} has no usable subpages` },
    };
  }

  const declared = toInt(raw.subpagecount);
  if (declared !== subpages.length) {
    warn(`subpagecount says ${String(raw.subpagecount)}, found ${subpages.length}`);
  }

  const page: Page = {
    number,
    name: toStr(raw.name) ?? '',
    subpages,
    subpageCount: subpages.length,
    animated: raw.animated === true || toStr(raw.animated)?.toLowerCase() === 'yes',
    warnings,
  };
  const prev = toInt(raw.prevpg);
  if (prev !== undefined) page.prevPage = prev;
  const next = toInt(raw.nextpg);
  if (next !== undefined) page.nextPage = next;
  const time = toStr(raw.time);
  if (time !== undefined && DATE_TIME.test(time)) page.time = time;
  else if (time !== undefined) warn(`unexpected time "${time}"`);
  const utc = toStr(raw.utctime);
  if (utc !== undefined && DATE_TIME.test(utc)) page.updatedAt = `${utc}Z`;
  else if (utc !== undefined) warn(`unexpected utctime "${utc}"`);
  const topType = toStr(raw.toptype);
  if (topType) page.topType = topType;

  return { ok: true, page };
}

/** Turn a parsed API response (any JSON value) into a `Page`, or an error. */
export function normalize(input: unknown): NormalizeResult {
  try {
    return normalizePage(input);
  } catch (e) {
    // Should not happen; the guards above cover every shape. Never throw anyway.
    return { ok: false, error: { kind: 'not-a-page', message: `Unexpected input: ${String(e)}` } };
  }
}
