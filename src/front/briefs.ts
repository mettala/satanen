/**
 * Brief pages (sähkeet, D35): a page made of several short news items, each
 * starting with an upper-case topic and a colon, like 202 URHEILUSÄHKEET:
 *
 *     PESÄPALLO: Naisten Superpesiksen kaikkien aikojen …
 *     AM.JALKAPALLO: Suomi voitti Vantaalla …
 *
 * The feeds show such a page as one card with the page's own name, the
 * number of briefs and the first few topics, instead of one brief's text
 * dressed up as an article.
 *
 * Pure functions over a normalised page; they never throw. Yle's text is
 * never changed: rows are only joined back with the reader's reflow rules
 * (reflow.ts) and the topic is split off the text. Each rule has a fixture
 * test in briefs.test.ts.
 *
 * Rules:
 *
 * - Detection is by structure, never by page number: a page is a brief page
 *   when, on its first subpage, the first row after the title (not a
 *   heading, not blank, not a title row) is a paragraph row that starts with
 *   a label (`BRIEF_LABEL`). Real articles start with Yle's double-height
 *   heading, so they never match. Only the first row counts: a label inside
 *   an article's text (`WSJ:` on 132) or a title row (`PÅ SVENSKA:` on 799)
 *   doesn't make a brief page.
 * - A brief starts at every paragraph row that begins with a label and runs
 *   to the next one. A row without a label right below belongs to the brief
 *   above (a continuation). A blank row, a decoration row or any row that
 *   isn't a paragraph (heading, table, link row) ends the brief's text; rows
 *   after it with no label of their own belong to no brief. Each subpage is
 *   read on its own: its first brief may start right below its title.
 * - Brief text: the brief's rows joined like the reader joins them (soft
 *   wraps by `isSoftWrap` + `joinWrapped`, so `36-` + `vuotiaan` reads
 *   `36-vuotiaan`; a deliberate break becomes one space, since the card
 *   shows one line), with the label and its colon cut off the front and
 *   kept as `label`. Numbers in the text (`120 NHL-ottelua`) stay text.
 * - Title: the page's name from its header row (`headerName`), with weekday
 *   names left out (`URHEILUSÄHKEET  LAUANTAI` → `URHEILUSÄHKEET`). Undefined
 *   when nothing is left: the card then uses the index headline.
 */
import { headerName } from '../parser/blocks';
import { classify, type ClassifiedLine, type ClassifiedSubpage } from '../parser/classify';
import type { Page } from '../parser/model';
import { isSoftWrap, joinWrapped, rowShape, type RowShape } from '../parser/reflow';

export interface Brief {
  /** The topic exactly as Yle prints it, without the colon: `PESÄPALLO`, `AM.JALKAPALLO`. */
  label: string;
  /** The brief's text after the label, rows joined. May be empty. */
  text: string;
}

export interface BriefPage {
  /** The page's own name from its header row (`URHEILUSÄHKEET`), as Yle sends it. */
  title?: string;
  /** Every brief on every subpage, in reading order; never empty. */
  briefs: Brief[];
}

/**
 * An upper-case topic and a colon at the start of a row: 2–25 characters of
 * A–Z, Å, Ä, Ö, digits, `.`, `-`, `/`, `&` and spaces, starting with a
 * letter, then `:` and a space or the row's end. `PESÄPALLO:`,
 * `AM.JALKAPALLO:`, `F1:`; not `Keskiviikon uutisia:` (lower case) or `12.30:`.
 */
export const BRIEF_LABEL = /^([A-ZÅÄÖ][A-ZÅÄÖ0-9.\-/& ]{1,24}):(?=\s|$)/u;

/**
 * The label and the rest of a row that starts with one; undefined otherwise.
 * Runs of spaces become one space in both (`PESÄPALLO:  Naisten  Super…` →
 * `Naisten Super…`), as in the brief's other rows.
 */
export function splitLabel(row: string): { label: string; rest: string } | undefined {
  const text = row.replace(/\s+/g, ' ').trim();
  const m = BRIEF_LABEL.exec(text);
  if (!m) return undefined;
  return { label: m[1].trim(), rest: text.slice(m[0].length).trim() };
}

/** A row's text as one line: runs of spaces become one space. */
const rowText = (line: ClassifiedLine) => line.text.replace(/\s+/g, ' ').trim();

/** Rows that come before the text: the dropped header row, logo pieces, title rows. */
function isLeadIn(line: ClassifiedLine): boolean {
  return line.kind === 'drop' || line.kind === 'blank' || line.kind === 'title';
}

function isBriefStart(line: ClassifiedLine): boolean {
  return line.kind === 'paragraph' && splitLabel(line.text) !== undefined;
}

/** True when the page is a brief page (see the rules above). */
export function isBriefPage(page: Page, subpages = classify(page)): boolean {
  const first = subpages[0]?.lines.find((l) => !isLeadIn(l));
  return first !== undefined && isBriefStart(first);
}

interface Open {
  label: string;
  text: string;
  last: RowShape;
  /** False after a row that ends the brief's text (blank, decoration, not a paragraph). */
  running: boolean;
}

/** The briefs on one subpage, in order. */
export function subpageBriefs(lines: readonly ClassifiedLine[]): Brief[] {
  const out: Brief[] = [];
  let open: Open | null = null;
  for (const line of lines) {
    if (line.kind === 'paragraph') {
      const start = splitLabel(line.text);
      if (start) {
        if (open) out.push({ label: open.label, text: open.text });
        open = { label: start.label, text: start.rest, last: rowShape(line.text), running: true };
      } else if (open?.running) {
        const shape = rowShape(line.text);
        const next = rowText(line);
        open.text = isSoftWrap(open.last, shape)
          ? joinWrapped(open.text, next)
          : open.text === ''
            ? next
            : `${open.text} ${next}`;
        open.last = shape;
      }
      continue;
    }
    // The header row and the text-less half of a double-height row are not
    // breaks (as in the reader); everything else ends the brief's text.
    if (line.rule === 'header-row' || line.rule === 'double-height-copy') continue;
    if (open) open.running = false;
  }
  if (open) out.push({ label: open.label, text: open.text });
  return out;
}

/** Weekday names in a header row (`LAUANTAI`), left out of the title. */
const WEEKDAYS = new Set([
  'maanantai',
  'tiistai',
  'keskiviikko',
  'torstai',
  'perjantai',
  'lauantai',
  'sunnuntai',
  'måndag',
  'tisdag',
  'onsdag',
  'torsdag',
  'fredag',
  'lördag',
  'söndag',
]);

/** The page's name from its header row, weekday left out; undefined if none. */
export function briefTitle(sp: ClassifiedSubpage | undefined): string | undefined {
  const name = headerName(sp);
  if (!name) return undefined;
  const title = name
    .split(' ')
    .filter((w) => !WEEKDAYS.has(w.toLowerCase()))
    .join(' ');
  return /\p{L}/u.test(title) ? title : undefined;
}

/** The page's briefs and name; undefined when it isn't a brief page. */
export function briefPage(page: Page): BriefPage | undefined {
  const subpages = classify(page);
  if (!isBriefPage(page, subpages)) return undefined;
  const briefs = subpages.flatMap((sp) => subpageBriefs(sp.lines));
  if (briefs.length === 0) return undefined;
  const title = briefTitle(subpages[0]);
  return title === undefined ? { briefs } : { title, briefs };
}

/** Words of this many letters keep their capitals in `titleCase`: `NHL`, `SM`, `HJK`. */
const ABBREVIATION = /^\p{L}{2,4}$/u;

/**
 * An all-caps page name as a headline (D35). Only the case changes, never a
 * letter:
 *
 * - A name that already has lower-case letters, or has a digit (`F1`,
 *   `U20`), is kept exactly as it is.
 * - Otherwise each word (a run of letters) of 2–4 letters keeps its
 *   capitals: these are almost always abbreviations (`NHL`, `SM`, `HJK`).
 *   Longer words (and single letters) go to lower case, and the name's
 *   first letter is a capital.
 *
 * `URHEILUSÄHKEET` → `Urheilusähkeet`, `NHL-JÄÄKIEKKO` → `NHL-jääkiekko`,
 * `SM-LIIGA` → `SM-liiga`.
 */
export function titleCase(name: string): string {
  if (/\p{Ll}/u.test(name) || /\d/u.test(name)) return name;
  let first = true;
  return name.replace(/\p{L}+/gu, (word) => {
    const atStart = first;
    first = false;
    if (ABBREVIATION.test(word)) return word;
    const lower = word.toLowerCase();
    return atStart ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  });
}
