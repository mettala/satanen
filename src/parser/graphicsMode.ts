/**
 * Which cells of a row are mosaic graphics, read from Yle's `all` content
 * (RP.8, docs/YLE-API.md quirk 28).
 *
 * Yle's `structured` content marks graphics runs with a `g` colour (`gyellow`),
 * but after a "separated graphics" code it loses the mark: on 891 the mosaic
 * big date and sun picture arrive as plain yellow text (`82 w { 80`,
 * `+ bs,bupuu`), mixed into the same run as the real words. The `all` content
 * of the same row still has every control code (`{GYellow}`, `{SG}`,
 * `{Yellow}`), so the teletext rules tell which cells are graphics:
 *
 *  - A row starts in text mode. `{GRed}`…`{GWhite}` switch to graphics mode,
 *    `{Red}`…`{White}` back to text mode. Both take effect from the next cell
 *    ("set-after"); the control code's own cell is shown in the old mode.
 *  - Every control code takes one cell, shown as a space.
 *  - In graphics mode, `@`, `A`–`Z`, `[`, `\`, `]`, `^`, `_` (and the Finnish
 *    letters Yle maps there, `Ä Ö Å É Ü`) still show as text ("blast-through"):
 *    `TORSTAI` on 130 and 160 is set that way and is real text.
 *
 * Simple and safe: when the `all` row has a code this file does not know, or
 * its characters do not match the `structured` row cell for cell, the answer
 * is `undefined` and the row is left exactly as `structured` sent it.
 */

const COLOUR_NAMES = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'];
/** Text-mode colour codes: switch to text from the next cell. */
const TEXT_CODES = new Set(COLOUR_NAMES);
/** Graphics-mode colour codes: switch to graphics from the next cell. */
const GRAPHICS_CODES = new Set(COLOUR_NAMES.map((c) => `G${c}`));
/**
 * Codes seen in the fixtures that do not change the mode: `SB` (only ever at a
 * row's start), new/black background, separated/contiguous graphics, double/
 * normal height, flash, steady, hold graphics.
 */
const OTHER_CODES = new Set(['SB', 'NB', 'SG', 'CG', 'DH', 'NH', 'Flash', 'Steady', 'Hold']);

/** Characters that show as text even in graphics mode. */
const BLAST_THROUGH = /^[@A-Z[\\\]^_ÄÖÅÉÜ]$/;

const CODE = /\{([A-Za-z]+)\}/y;

interface Cell {
  char: string;
  /** The cell holds a control code (shown as a space). */
  control: boolean;
  /** The cell is shown in graphics mode. */
  graphicsMode: boolean;
}

/** The `all` row as cells, or undefined when it has a code we do not know. */
function cells(all: string): Cell[] | undefined {
  const out: Cell[] = [];
  let graphicsMode = false;
  let i = 0;
  while (i < all.length) {
    CODE.lastIndex = i;
    const m = CODE.exec(all);
    if (m) {
      const code = m[1];
      if (!TEXT_CODES.has(code) && !GRAPHICS_CODES.has(code) && !OTHER_CODES.has(code)) {
        return undefined;
      }
      out.push({ char: ' ', control: true, graphicsMode });
      if (TEXT_CODES.has(code)) graphicsMode = false;
      if (GRAPHICS_CODES.has(code)) graphicsMode = true;
      i += m[0].length;
      continue;
    }
    // A `{` that does not start a known code is a plain character (891 row 5: `{{GYellow}`).
    out.push({ char: all[i], control: false, graphicsMode });
    i++;
  }
  return out;
}

/**
 * Per cell of `text` (the row from `structured`), true when `all` shows the cell
 * as a mosaic: in graphics mode and not a blast-through letter. Spaces and
 * control cells in graphics mode count as mosaic too (an empty mosaic), so a
 * graphics stretch stays one piece. Undefined when `all` cannot be trusted for
 * this row: an unknown code, more cells than the row, or a character that
 * differs from `text`.
 */
export function mosaicCells(all: string, text: string): boolean[] | undefined {
  const row = cells(all);
  if (!row || row.length > text.length) return undefined;
  for (let i = 0; i < row.length; i++) {
    const want = row[i].control ? ' ' : row[i].char;
    if (text[i] !== want) return undefined;
  }
  return Array.from({ length: text.length }, (_, i) => {
    const cell = row[i];
    if (!cell?.graphicsMode) return false;
    return !BLAST_THROUGH.test(cell.char);
  });
}
