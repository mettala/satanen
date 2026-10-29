export interface SectionLabelRows {
  /** First row: the section name, in the section colour. */
  readonly name: string;
  /** Second row: date and time, or a page number. Null when there is nothing to show. */
  readonly detail: string | null;
}

/** The meta line above a title: the section name on one row, the rest below it (RP.2). */
export function sectionLabelRows(label: string, suffix?: string | number): SectionLabelRows {
  const detail = suffix === undefined || suffix === '' ? null : String(suffix);
  return { name: label, detail };
}
