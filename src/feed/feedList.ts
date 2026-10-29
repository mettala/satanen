/**
 * The news feeds' story lists, built from Yle's section index pages
 * (decision D25): Uutiset = 102 Kotimaa then 130 Ulkomaat, Talous = 160,
 * Urheilu = 201.
 *
 * Pure functions over normalised pages; they never throw and never fetch.
 * Headlines are passed on exactly as the reader blocks give them (Yle's
 * licence: no rewording). The row parsing is not repeated here: the day's
 * rows are picked from `classify()`'s output, and the existing reader blocks
 * and the front page's `headlines()` turn them into entries.
 *
 * Rules (each has a fixture test in feedList.test.ts):
 *
 * - Date row: a plain text row (`paragraph`) that is a weekday, optionally
 *   with `uutisia`, a date and a colon: `Keskiviikon uutisia:` (102, 130,
 *   160), `Keskiviikko` (201), `Lauantain uutisia 24.10.`. The weekday in the
 *   page's title area (`TORSTAI`, row 2) is a `title` row, not a date row.
 * - The day's list: the headline rows right after the date row. Blank rows
 *   between the date row and the first headline are skipped (201); the list
 *   ends at the first row that is not a headline row (a blank row, the
 *   coloured bottom bar, text). That leaves out 160's service links after
 *   its blank row (rates, `174` stock prices; Talous adds them at its end,
 *   see below) and 201's promos above its date row (`235` NHL, `355` a TV
 *   match).
 * - Kotimaa and Ulkomaat (102, 130) also take the headline rows above the
 *   date row: on a day's first hours Yle lists the new stories there with no
 *   label (`131`-`135`) and the date row heads the day before's
 *   (`Maanantain uutisia:`, `136`-`140`). The two blocks keep Yle's order.
 *   Talous and Urheilu don't: 201's promos sit above its date row.
 * - Each subpage is read on its own. A subpage with no date row, or a date
 *   row with no headline under it, gives every headline row (as on the
 *   front page). A layout change at Yle then shows too much, not nothing.
 * - Items: as `headlines()` in src/front/: links to one page only (ranges
 *   such as `172-173` and web links are not items), index pages
 *   (`NAV_PAGES`: 102, 130, 160, 200, 201…) are not items, and each page
 *   appears once, with its first headline. Coloured bars are never items.
 * - Urheilu keeps 2xx and 6xx pages only (Yle puts European football on
 *   6xx) and drops the rest (a `355` TV listing). Its items are all labelled
 *   `sport`, so 661 shows as Urheilu, not grey.
 * - Uutiset is Kotimaa's items, then Ulkomaat's, each in Yle's order; a
 *   page in both is kept once. A missing index page (not loaded) adds
 *   nothing, so the other half still shows.
 * - Talous ends with 160's service links (D40): rates `172-173`, world stock
 *   prices `174`, stock pages `175-187`, electricity `188-189`. The service
 *   block starts at the first page range in a run of link rows (no blank or
 *   text row between them) and goes to the end of the run; Yle lists them
 *   after a blank row under the day's list, and if it ever leaves out the
 *   blank row the stories above the first range stay stories. Its rows are
 *   never stories, even on a day with
 *   no date row (Sundays: the service links are all 160 has), and they come
 *   after the day's stories, each once, in Yle's order and wording. A range
 *   opens its first page (`172-173` → 172). They are marked `service`: they
 *   are tables, so the feed loads no first paragraph for them. If Yle ever
 *   lists them without a range, the block isn't found and Talous is as
 *   before (the day's list; on a day without one, every headline row).
 *   Only Talous has service links: Uutiset and Urheilu are unchanged (201's
 *   `277-278` NBA promo is not one).
 */
import { classify, type ClassifiedLine, type ClassifiedSubpage } from '../parser/classify';
import { toReaderBlocks } from '../parser/blocks';
import type { Page } from '../parser/model';
import { headlines, NAV_PAGES } from '../front/frontPage';
import { sectionOf } from '../sections/sectionOf';
import type { SectionId } from '../theme';

export type FeedId = 'kotimaa' | 'ulkomaat' | 'uutiset' | 'talous' | 'urheilu';

export const FEED_IDS: readonly FeedId[] = ['kotimaa', 'ulkomaat', 'uutiset', 'talous', 'urheilu'];

export interface FeedItem {
  /** The page the item opens, e.g. 105. */
  page: number;
  /** Headline exactly as on the index page, e.g. `Yksi kuoli Jyväskylän palossa`. */
  headline: string;
  /** Section colour id of the item (see `sectionOf`; Urheilu's items are all `sport`). */
  section: SectionId;
  /**
   * A service page (Talous: rates, stock prices, electricity), not a story.
   * It is a table, so no first paragraph is loaded or shown for it (D40).
   */
  service?: true;
}

/** The index pages each feed is built from, in the order they are listed. */
export const FEED_PAGES: Readonly<Record<FeedId, readonly number[]>> = {
  kotimaa: [102],
  ulkomaat: [130],
  uutiset: [102, 130],
  talous: [160],
  urheilu: [201],
};

/** Index pages by number; a page that isn't loaded is left out (or undefined). */
export type IndexPages = Readonly<Partial<Record<number, Page>>>;

/** Feeds whose index pages end with service links (D40). */
const SERVICE_FEEDS: ReadonlySet<FeedId> = new Set(['talous']);

/**
 * Feeds whose index pages list the newest stories above the date row (102,
 * 130: `103`, `104` first, then `Maanantain uutisia:` for yesterday's). 160
 * and 201 have other things there (service links, promos).
 */
const LEAD_FEEDS: ReadonlySet<FeedId> = new Set(['kotimaa', 'ulkomaat', 'uutiset']);

const WEEKDAY =
  '(?:maanantai|tiistai|keskiviikko|keskiviikon|torstai|perjantai|lauantai|sunnuntai)n?';
const DATE = '\\d{1,2}\\.\\d{1,2}\\.(?:\\d{2,4})?';
const DATE_ROW = new RegExp(`^${WEEKDAY}(?:\\s+uutisia)?(?:\\s+${DATE})?:?$`, 'iu');

/** True for the row that starts the day's list (`Keskiviikon uutisia:`, `Keskiviikko`). */
export function isDateRow(line: ClassifiedLine): boolean {
  return line.kind === 'paragraph' && line.links.length === 0 && DATE_ROW.test(line.text.trim());
}

function isListRow(line: ClassifiedLine): boolean {
  return line.kind === 'headline' || (line.kind === 'nav' && line.rule !== 'coloured-nav');
}

function isSkippable(line: ClassifiedLine): boolean {
  return line.kind === 'blank' || line.kind === 'drop';
}

const BLANK_TEXT = ' '.repeat(40);

function blanked(line: ClassifiedLine): ClassifiedLine {
  return { ...line, kind: 'blank', rule: 'blank', text: BLANK_TEXT, links: [] };
}

/**
 * Row numbers of the day's list on one subpage: the headline rows after the
 * date row, and with `withLead` also the headline rows above it (the stories
 * newer than the date row's day). Undefined when the subpage has no date row
 * or no headline under it.
 */
function dayListRows(sp: ClassifiedSubpage, withLead: boolean): Set<number> | undefined {
  const start = sp.lines.findIndex(isDateRow);
  if (start === -1) return undefined;
  const rows = new Set<number>();
  if (withLead) {
    for (const line of sp.lines.slice(0, start)) if (isListRow(line)) rows.add(line.number);
  }
  for (const line of sp.lines.slice(start + 1)) {
    if (isListRow(line)) rows.add(line.number);
    else if (rows.size > 0 || !isSkippable(line)) break;
  }
  return rows.size > 0 ? rows : undefined;
}

const hasRange = (line: ClassifiedLine) => line.links.some((l) => l.target.kind === 'range');

/**
 * Row numbers of the service links on one subpage (D40): in each run of
 * consecutive link rows, the rows from its first page range to its end.
 * Empty when there is no range.
 */
function serviceRows(sp: ClassifiedSubpage): Set<number> {
  const rows = new Set<number>();
  let run: ClassifiedLine[] = [];
  const close = () => {
    const first = run.findIndex(hasRange);
    if (first !== -1) for (const line of run.slice(first)) rows.add(line.number);
    run = [];
  };
  for (const line of sp.lines) {
    if (isListRow(line)) run.push(line);
    else close();
  }
  close();
  return rows;
}

/** Keep the rows `keep` picks on each subpage; blank every other row. */
function onlyRows(
  subpages: readonly ClassifiedSubpage[],
  keep: (sp: ClassifiedSubpage) => (line: ClassifiedLine) => boolean,
): ClassifiedSubpage[] {
  return subpages.map((sp) => {
    const kept = keep(sp);
    return { ...sp, lines: sp.lines.map((line) => (kept(line) ? line : blanked(line))) };
  });
}

/**
 * Keep only the day's list on each subpage that has one (every row on one
 * that hasn't), minus the service rows when `services` is set.
 */
function dayListOnly(
  subpages: readonly ClassifiedSubpage[],
  services: boolean,
  withLead: boolean,
): ClassifiedSubpage[] {
  return onlyRows(subpages, (sp) => {
    const day = dayListRows(sp, withLead);
    const skip = services ? serviceRows(sp) : new Set<number>();
    return (line) => (!day || day.has(line.number)) && !skip.has(line.number);
  });
}

/**
 * One index page → its day's stories, in Yle's order, each page once. With
 * `services` (Talous), the service rows are never stories (see `serviceItems`).
 * With `withLead` (Kotimaa, Ulkomaat), the stories above the date row count
 * too.
 */
export function indexItems(page: Page, services = false, withLead = false): FeedItem[] {
  const blocks = toReaderBlocks(page, dayListOnly(classify(page), services, withLead));
  return headlines(blocks).map((h) => ({ page: h.page, headline: h.text, section: h.section }));
}

/**
 * One index page → its service links (D40), in Yle's order and wording, each
 * page once. A range opens its first page; web links, links to index pages
 * and rows without a label are left out.
 */
export function serviceItems(page: Page): FeedItem[] {
  const subpages = onlyRows(classify(page), (sp) => {
    const rows = serviceRows(sp);
    return (line) => rows.has(line.number);
  });
  const seen = new Set<number>();
  const out: FeedItem[] = [];
  for (const block of toReaderBlocks(page, subpages)) {
    if (block.kind !== 'linkList' || block.variant !== 'list') continue;
    for (const { target, label } of block.entries) {
      const n = target.kind === 'page' ? target.page : target.kind === 'range' ? target.from : null;
      if (n === null || label === '' || NAV_PAGES.has(n) || seen.has(n)) continue;
      seen.add(n);
      out.push({ page: n, headline: label, section: sectionOf(n).id, service: true });
    }
  }
  return out;
}

function isSportPage(page: number): boolean {
  return (page >= 200 && page <= 299) || (page >= 600 && page <= 699);
}

/**
 * The feed's stories from the index pages given (missing pages add nothing),
 * then, on Talous, the service links (D40).
 */
export function feedList(id: FeedId, pages: IndexPages): FeedItem[] {
  const services = SERVICE_FEEDS.has(id);
  const withLead = LEAD_FEEDS.has(id);
  const seen = new Set<number>();
  const out: FeedItem[] = [];
  const add = (item: FeedItem) => {
    if (seen.has(item.page)) return;
    if (id === 'urheilu') {
      if (!isSportPage(item.page)) return;
      item.section = 'sport';
    }
    seen.add(item.page);
    out.push(item);
  };
  const loaded = FEED_PAGES[id].flatMap((n) => pages[n] ?? []);
  for (const page of loaded) indexItems(page, services, withLead).forEach(add);
  if (services) for (const page of loaded) serviceItems(page).forEach(add);
  return out;
}
