import { pageImageUrl } from '../../api/client';
import type { InlineSegment, ReaderBlock, SubpageDividerBlock } from '../../parser/blocks';
import type { ReaderLink } from '../../parser/classify';
import type { PageAssessment } from '../../parser/confidence';
import { splitSubpages } from './subpages';

/** One subpage of an article, ready to render: reader blocks or its own picture. */
export interface SubpagePlan {
  /** 1-based subpage number. */
  number: number;
  divider?: SubpageDividerBlock;
  /**
   * How many of `blocks` come before the divider. Non-zero only on subpage 1,
   * where the title of the whole page (196-199, 176, 184) is read first and
   * `1/N` follows it. When the name changes per subpage (301, 425) the name
   * is not a page title: it stays under the marker, as on subpages 2..N.
   */
  dividerAt: number;
  fallback: boolean;
  /** Reader blocks (empty when `fallback`). */
  blocks: ReaderBlock[];
  /** This subpage's PNG from the proxy; set only when `fallback` and the URL is valid. */
  imageUrl: string | null;
}

/**
 * Decide, per subpage, reader mode or picture. A whole-page fallback shows
 * every subpage's picture; a partial fallback shows each failing subpage's
 * own picture (`pageImageUrl(page, number)`) between reader-mode subpages.
 */
export function planSubpages(
  page: number,
  blocks: readonly ReaderBlock[],
  assessment: PageAssessment,
): SubpagePlan[] {
  const parts = splitSubpages(blocks);
  const count = Math.max(parts.length, assessment.subpages.length, 1);
  const varying = parts.some((p) => (p.divider?.titles.length ?? 0) > 0);
  const out: SubpagePlan[] = [];
  for (let number = 1; number <= count; number++) {
    const part = parts.find((p) => p.number === number);
    const fallback =
      assessment.fallback ||
      (assessment.subpages.find((s) => s.number === number)?.fallback ?? false);
    const shown = fallback ? [] : (part?.blocks ?? []);
    let dividerAt = 0;
    if (number === 1 && !varying) {
      while (shown[dividerAt]?.kind === 'title') dividerAt++;
    }
    out.push({
      number,
      dividerAt,
      // Every subpage of a multi-subpage page opens with `n/N`, the first one too.
      divider:
        part?.divider ??
        (count > 1 ? { kind: 'subpageDivider', number, count, titles: [] } : undefined),
      fallback,
      blocks: shown,
      imageUrl: fallback ? pageImageUrl(page, number) : null,
    });
  }
  return out;
}

export interface ParagraphLink {
  text: string;
  target: ReaderLink;
}

/** The links of a paragraph, in order, without repeats of the same target. */
export function paragraphLinks(segments: readonly InlineSegment[]): ParagraphLink[] {
  const seen = new Set<string>();
  const out: ParagraphLink[] = [];
  for (const seg of segments) {
    if (seg.kind !== 'link') continue;
    const key = JSON.stringify(seg.target);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: seg.text, target: seg.target });
  }
  return out;
}

/**
 * Split a subpage divider's lines into plain titles and captions. A caption
 * ends in `:` (`Saamenkieliset uutiset:` on 197/3) and introduces what follows.
 * When the subpage opens with a single-letter heading, the caption belongs after it,
 * right above the first entry, so it stays with the links it introduces.
 * `index` is the block the captions go above; only the display moves, the
 * parser output is unchanged.
 */
export function captionGroups(
  titles: readonly string[],
  blocks: readonly ReaderBlock[],
): { titles: string[]; captions: string[]; index: number } {
  const first = blocks[0];
  const next = blocks[1];
  if (!first || first.kind !== 'heading' || !/^\p{L}$/u.test(first.text.trim()) || !next)
    return { titles: [...titles], captions: [], index: -1 };
  return {
    titles: titles.filter((t) => !t.trimEnd().endsWith(':')),
    captions: titles.filter((t) => t.trimEnd().endsWith(':')),
    index: 1,
  };
}
