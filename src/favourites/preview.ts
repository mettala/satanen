/**
 * Text for a live favourite card (M3.14): page → `{ label, time, headline, sub }`.
 *
 * Pure and never throws. Yle's text is passed on exactly as the reader blocks
 * give it: nothing is cut or reworded here (the UI clamps lines). The one
 * exception is the article's "first sentence", which is a whole sentence taken
 * from the start of the first paragraph, not a shortened one.
 *
 * Rules (each has a fixture test in preview.test.ts):
 *
 * - label: the page's own name when Yle gives one (`Kotimaa` on 102), else the
 *   section name from the page number (`sectionOf`). The UI writes it in caps.
 * - time: the page's last-modified time as `14:32`, from Yle's local time.
 * - Article (first block after title rows is a heading): headline = the
 *   heading, sub = the first sentence of the first paragraph.
 * - Index (headline lists, e.g. 102, 160): headline = the first headline, sub =
 *   "+ N muuta uutista" with N = the other headlines on the page. Headlines
 *   are found like on the front page (`headlines()`: navigation, bars and
 *   repeated entries left out). With only one headline there is no sub.
 * - Table page (first block after title rows and coloured link bars, with
 *   any text left over on a bar row, is a table: 230, 235, 250, 406):
 *   headline = its first title row; else the name in its header row
 *   (`headerName`: `NHL-JÄÄKIEKKO` on 235, `JALKAPALLO T18 SM` on 250); else
 *   the section name. Never a body line: on table pages those are footnotes
 *   (`Runkosarjassa pelataan 44 kierrosta.` under 230's table). No sub.
 * - Fallback page (403, anything else): headline = its first title row; if it
 *   has none, its first paragraph; else empty. No sub.
 * - No page (not found, offline without a copy): label from the page number,
 *   everything else empty, so the card can show its own error state.
 */
import { headlines } from '../front/frontPage';
import { t } from '../i18n';
import { headerName, toReaderBlocks, type ReaderBlock } from '../parser/blocks';
import { classify } from '../parser/classify';
import type { Page } from '../parser/model';
import { sectionOf } from '../sections/sectionOf';
import { formatHourMinute } from '../ui/page/format';

export interface FavouritePreview {
  /** Page name or section name, e.g. `Kotimaa`. Never empty. */
  label: string;
  /** Last-modified time `14:32`; undefined when the page has none. */
  time?: string;
  /** Main line; `''` when the page has no usable text. */
  headline: string;
  /** Second line; undefined when there is none. */
  sub?: string;
}

/** `2026-10-22T00:15:51` → `0:15`. */
function clockTime(time: string | undefined): string | undefined {
  const m = /T(\d{2}):(\d{2})/.exec(time ?? '');
  return m ? formatHourMinute(m[1], m[2]) : undefined;
}

function paragraphText(block: ReaderBlock): string | undefined {
  if (block.kind !== 'paragraph') return undefined;
  const text = block.segments.map((s) => s.text).join('');
  return text.trim() === '' ? undefined : text;
}

/**
 * The first sentence of a text: up to the first `.`, `!` or `?` that is
 * followed by a space and a capital letter or digit, or by the end. A full stop
 * right after a digit (`21.`, `klo 12.`) is not taken as an end. Without an
 * end the whole text is returned.
 */
export function firstSentence(text: string): string {
  const end = /[.!?]+["')»”]*(?=\s+[\p{Lu}\d"(«“]|\s*$)/gu;
  let m: RegExpExecArray | null;
  while ((m = end.exec(text))) {
    const before = text[m.index - 1];
    if (m[0] === '.' && before !== undefined && /\d/.test(before)) continue;
    return text.slice(0, m.index + m[0].length);
  }
  return text;
}

/** Page (or nothing) → card text. `pageNumber` is used when there is no page. */
export function favouritePreview(page: Page | undefined, pageNumber?: number): FavouritePreview {
  const number = page?.number ?? pageNumber ?? 0;
  const label = page?.name.trim() ? page.name : sectionOf(number).label;
  if (!page) return { label, headline: '' };

  const base = { label, time: clockTime(page.time) };
  const subpages = classify(page);
  const blocks = toReaderBlocks(page, subpages);
  const first = blocks.find((b) => b.kind !== 'title');

  if (first?.kind === 'heading') {
    const para = blocks.map(paragraphText).find((p) => p !== undefined);
    return {
      ...base,
      headline: first.text,
      sub: para === undefined ? undefined : firstSentence(para),
    };
  }

  const news = headlines(blocks);
  if (news.length > 0) {
    return {
      ...base,
      headline: news[0].text,
      sub: news.length > 1 ? t.favouritePreview.moreNews(news.length - 1) : undefined,
    };
  }

  const title = blocks.find((b) => b.kind === 'title');
  const isBar = (b: ReaderBlock | undefined) => b?.kind === 'linkList' && b.variant === 'bar';
  // Text left over on a bar row stands right before that bar (406-408: the
  // issue time `21.10. klo 15.30` before the `selitteet` link); it is not content.
  const content = blocks.find(
    (b, i) => b.kind !== 'title' && !isBar(b) && !(b.kind === 'paragraph' && isBar(blocks[i + 1])),
  );
  if (content?.kind === 'table') {
    const headline =
      title?.kind === 'title' ? title.text : (headerName(subpages[0]) ?? sectionOf(number).label);
    return { ...base, headline };
  }
  const headline =
    title?.kind === 'title' ? title.text : (blocks.map(paragraphText).find(Boolean) ?? '');
  return { ...base, headline };
}
