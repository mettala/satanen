/**
 * The front-page model: page 100 → lead story + headlines grouped by section,
 * and `ingress()` for the lead card's short intro (decision D19).
 *
 * Pure functions over a normalised page; they never throw. Yle's text is
 * never changed: headlines and the ingress are passed on exactly as the
 * reader blocks give them. The UI clamps long text on screen.
 *
 * Rules (each has a fixture test in frontPage.test.ts):
 *
 * - Headlines are the entries of page 100's headline lists (`linkList` with
 *   `variant: 'list'`). Coloured section-link bars (`variant: 'bar'`: the
 *   masthead's `199 PÄÄHAKEMISTO`, the bottom bars `101 UUTISET …` and their
 *   promo rows) are not headlines.
 * - Navigation entries are left out: entries without a label, entries that
 *   point to a web address or a page range, and entries that point to a
 *   section index page (`NAV_PAGES`: 101 Uutiset, 102 Kotimaa, 201 Urheilu…).
 * - Repeated headlines are left out: page 100 shows the same five headlines
 *   on each of its four subpages. `toReaderBlocks` already keeps rows repeated
 *   on every subpage once; on top of that a page linked twice is kept once
 *   (the first time it appears).
 * - Lead = the first headline. The rest are grouped by the page they link
 *   to (`sectionOf`), in the order Kotimaa, Ulkomaat, Talous, Urheilu,
 *   then any other section in the order it first appears. Inside a group the
 *   headlines keep page 100's order. Empty groups are not returned.
 * - `ingress(page)` is an article's first paragraph: the first `paragraph`
 *   block right after the article's heading (Yle's double-height headline;
 *   title rows before it are skipped). If the page has no heading before its
 *   first paragraph (index pages 102/130/160 start `Keskiviikon uutisia:`,
 *   result pages 237/242 start with a table caption, 890 with mosaics), or
 *   something else comes first (a link list, a table, a subpage break), it
 *   is not an article and there is no ingress (`undefined`): the lead card
 *   then shows only the headline, which is better than a wrong intro.
 *   One exception (M3.33): a bulletin page with no heading that starts with
 *   running text shows the story its headline names, or its first story
 *   (see `ingress`). Brief pages whose first row is `LABEL:` (202
 *   URHEILUSÄHKEET) are caught before this by `briefPage` (briefs.ts, D35)
 *   and shown as a brief card; `ingress` itself is unchanged.
 */
import type { Page } from '../parser/model';
import {
  toReaderBlocks,
  type LinkEntry,
  type ParagraphBlock,
  type ReaderBlock,
} from '../parser/blocks';
import { sectionOf } from '../sections/sectionOf';
import type { SectionId } from '../theme';

export interface Headline {
  /** The page the headline opens, e.g. 136. */
  page: number;
  /** Headline text exactly as on page 100, e.g. `Putin: Olen valmis neuvotteluihin`. */
  text: string;
  /** Section colour id of `page` (see `sectionOf`). */
  section: SectionId;
}

export interface HeadlineGroup {
  /** Section colour id shared by every headline in the group. */
  section: SectionId;
  /** Headlines in page 100's order; never empty. */
  headlines: Headline[];
}

export interface FrontPage {
  /** The first headline, shown as the lead card. Undefined when there are no headlines. */
  lead?: Headline;
  /** The other headlines grouped by section, in `SECTION_ORDER`. */
  groups: HeadlineGroup[];
}

/** Sections shown first, in this order; any other section follows. */
export const SECTION_ORDER: readonly SectionId[] = ['news', 'world', 'business', 'sport'];

/**
 * Section index pages: links to these are navigation, not news. Page 100
 * itself, the hundred-block indexes (101, 200, 300…), the news section
 * indexes 102 Kotimaa / 130 Ulkomaat / 160 Talous, 190 News in English, 199
 * Hakemistot and 201 Urheilu-uutiset.
 */
export const NAV_PAGES: ReadonlySet<number> = new Set([
  100, 101, 102, 130, 160, 190, 199, 200, 201, 300, 400, 500, 700, 799, 800,
]);

function toHeadline(entry: LinkEntry): Headline | undefined {
  if (entry.target.kind !== 'page' || entry.label === '') return undefined;
  const page = entry.target.page;
  if (NAV_PAGES.has(page)) return undefined;
  return { page, text: entry.label, section: sectionOf(page).id };
}

/** Every headline on the page, in reading order, each page once. */
export function headlines(blocks: readonly ReaderBlock[]): Headline[] {
  const seen = new Set<number>();
  const out: Headline[] = [];
  for (const block of blocks) {
    if (block.kind !== 'linkList' || block.variant !== 'list') continue;
    for (const entry of block.entries) {
      const headline = toHeadline(entry);
      if (!headline || seen.has(headline.page)) continue;
      seen.add(headline.page);
      out.push(headline);
    }
  }
  return out;
}

function sectionRank(section: SectionId): number {
  const i = SECTION_ORDER.indexOf(section);
  return i === -1 ? SECTION_ORDER.length : i;
}

/** Page 100 → lead story and grouped headlines. */
export function frontPage(page: Page): FrontPage {
  const [lead, ...rest] = headlines(toReaderBlocks(page));

  const groups: HeadlineGroup[] = [];
  for (const headline of rest) {
    const group = groups.find((g) => g.section === headline.section);
    if (group) group.headlines.push(headline);
    else groups.push({ section: headline.section, headlines: [headline] });
  }
  // Array.prototype.sort is stable: sections outside SECTION_ORDER keep
  // the order they first appear in.
  groups.sort((a, b) => sectionRank(a.section) - sectionRank(b.section));

  return { lead, groups };
}

const paragraphText = (block: ParagraphBlock) => block.segments.map((s) => s.text).join('');

/**
 * Running text, not a caption or a list header: at least `PROSE_MIN_WORDS`
 * words, some lower-case letters, and the last one ends a sentence.
 * `PESÄPALLO: Naisten Superpesiksen … Pesäkarhuihin.` is prose;
 * `Keskiviikon uutisia:`, `MESTARUUSSARJA` and `Lauantai` are not.
 */
const PROSE_MIN_WORDS = 6;
const SENTENCE_END = /[.!?…]["”')]*$/u;

export function isProse(text: string): boolean {
  const t = text.trim();
  return SENTENCE_END.test(t) && /\p{Ll}/u.test(t) && t.split(/\s+/u).length >= PROSE_MIN_WORDS;
}

/**
 * Words compared between a headline and a paragraph: 3 letters or more, in
 * lower case, cut to their first 5 letters so that Finnish endings still
 * match (`Tedenbyn` / `Tedenby`, `Sarkkinen` / `Sarkkisen`).
 */
export function wordKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length >= 3) keys.add(w.slice(0, 5));
  }
  return keys;
}

/** A paragraph shares at least this many words with the headline to count as its story. */
export const MATCH_MIN_WORDS = 2;

/** The paragraph sharing the most words with the headline (`MATCH_MIN_WORDS`+), first on a tie. */
function bestMatch(paragraphs: readonly string[], headline: string): string | undefined {
  const wanted = wordKeys(headline);
  let best: string | undefined;
  let bestCount = MATCH_MIN_WORDS - 1;
  for (const p of paragraphs) {
    let count = 0;
    for (const k of wordKeys(p)) if (wanted.has(k)) count++;
    if (count > bestCount) {
      best = p;
      bestCount = count;
    }
  }
  return best;
}

/**
 * An article page → the paragraph shown under its headline, unchanged
 * (the "sneak peek"); undefined if it has none.
 *
 * - An article (Yle's double-height heading first): the first paragraph
 *   right after the heading, as before (D19).
 * - A bulletin page with no heading (`URHEILUSÄHKEET` 202: several short
 *   stories, each a paragraph that starts `JALKAPALLO:`, `JÄÄKIEKKO:`): the
 *   page must start with running text (`isProse`). Several index rows can
 *   point to the same bulletin page, so the paragraph sharing the most words
 *   with `headline` is chosen (`David Ezeh siirtyy …` → the `JALKAPALLO:`
 *   story about Ezeh); with no such paragraph (or no headline), the first.
 * - Anything else (index pages, result tables, captions, mosaics) has
 *   nothing to show. The item then shows only its headline, which is better
 *   than a wrong preview. Text is never shortened or reworded.
 */
export function ingress(page: Page, headline?: string): string | undefined {
  const blocks = toReaderBlocks(page).filter((b) => b.kind !== 'title');
  const first = blocks[0];
  if (!first) return undefined;

  if (first.kind === 'heading') {
    const next = blocks.find((b) => b.kind !== 'heading');
    if (next?.kind !== 'paragraph') return undefined;
    const text = paragraphText(next);
    return text.trim() === '' ? undefined : text;
  }

  if (first.kind !== 'paragraph' || !isProse(paragraphText(first))) return undefined;
  const prose = blocks
    .filter((b): b is ParagraphBlock => b.kind === 'paragraph')
    .map(paragraphText)
    .filter(isProse);
  return (headline ? bestMatch(prose, headline) : undefined) ?? prose[0];
}
