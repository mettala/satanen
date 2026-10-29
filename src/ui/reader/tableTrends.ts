import type { TableBlock, TrendMark } from '../../parser/blocks';

/** A piece of a table row: plain text, or a price change to colour. */
export interface RowPart {
  text: string;
  trend?: TrendMark['trend'];
}

/**
 * One table row cut into plain pieces and the marked price changes, in
 * order. Joining the pieces' text gives the row back unchanged. Marks that
 * overlap or fall outside the row are skipped.
 */
export function rowParts(text: string, marks: readonly TrendMark[]): RowPart[] {
  const parts: RowPart[] = [];
  let at = 0;
  for (const m of [...marks].sort((a, b) => a.column - b.column)) {
    if (m.column < at || m.column + m.length > text.length) continue;
    if (m.column > at) parts.push({ text: text.slice(at, m.column) });
    parts.push({ text: text.slice(m.column, m.column + m.length), trend: m.trend });
    at = m.column + m.length;
  }
  if (at < text.length || parts.length === 0) parts.push({ text: text.slice(at) });
  return parts;
}

/** The marks of each line of a table, by line index. */
export function marksByLine(block: TableBlock): Map<number, TrendMark[]> {
  const byLine = new Map<number, TrendMark[]>();
  for (const m of block.trends ?? []) {
    const list = byLine.get(m.line);
    if (list) list.push(m);
    else byLine.set(m.line, [m]);
  }
  return byLine;
}

/**
 * The row for a screen reader: each price change followed by its word
 * (`-5,89 lasku`), spaces tidied. The sign is read too; the word only
 * repeats what the colour shows.
 */
export function rowLabel(parts: readonly RowPart[], words: { up: string; down: string }): string {
  return parts
    .map((p) => (p.trend ? `${p.text} ${p.trend === 'up' ? words.up : words.down}` : p.text))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
