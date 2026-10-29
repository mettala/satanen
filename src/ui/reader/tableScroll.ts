/** Which sides of a sideways-scrolling table hide columns, for the scroll cue. */
export interface TableEdges {
  /** Columns are hidden to the left (the reader has scrolled). */
  left: boolean;
  /** Columns are hidden to the right: the table is wider than the screen. */
  right: boolean;
}

/** Less than this many pixels hidden counts as nothing (rounding on web). */
const SLACK = 1;

/**
 * From the visible width, the table's full width and how far it is scrolled.
 * A table that fits shows no cue; widths not measured yet (0) show none either.
 */
export function tableEdges(viewport: number, content: number, scrollX: number): TableEdges {
  if (viewport <= 0 || content <= viewport + SLACK) return { left: false, right: false };
  return { left: scrollX > SLACK, right: content - viewport - scrollX > SLACK };
}
