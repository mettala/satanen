/**
 * What a brief card shows (D35, design option B), as a plain function so it
 * can be tested without rendering (briefCard.test.ts). Used by the feed item,
 * Etusivu's headline rows and the lead card.
 */
import { titleCase, type Brief } from '../../front/briefs';
import { t } from '../../i18n';

/** Briefs shown on the card; with more, a "Lue kaikki sähkeet ›" row follows. */
export const BRIEFS_SHOWN = 3;

export interface BriefCardData {
  /** The page's name from its header row (`URHEILUSÄHKEET`); missing: the index headline is used. */
  title?: string;
  /** Every brief on the page; never empty. */
  briefs: readonly Brief[];
}

export interface BriefCardPlan {
  /** The page's own name as a headline (`Urheilusähkeet`), else the index headline. */
  headline: string;
  /** `4 sähkettä` / `1 sähke`: every brief on every subpage. */
  count: string;
  /** The briefs drawn on the card, at most `BRIEFS_SHOWN`. */
  rows: readonly Brief[];
  /** More briefs than `rows`: show "Lue kaikki sähkeet ›". */
  more: boolean;
  /** Read by screen readers for the whole card: `Urheilusähkeet, 4 sähkettä`. */
  accessibilityLabel: string;
}

export function briefCardPlan(data: BriefCardData, indexHeadline: string): BriefCardPlan {
  const headline = data.title ? titleCase(data.title) : indexHeadline;
  const count = t.feed.briefCount(data.briefs.length);
  return {
    headline,
    count,
    rows: data.briefs.slice(0, BRIEFS_SHOWN),
    more: data.briefs.length > BRIEFS_SHOWN,
    accessibilityLabel: t.feed.briefCardLabel(headline, count),
  };
}
