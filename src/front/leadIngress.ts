import type { PageState } from '../data';
import { briefPage, type Brief } from './briefs';
import { ingress } from './frontPage';

/**
 * What the lead card shows under its headline, from the lead article's load
 * state. The ingress loads separately from the front page (D19), so it may
 * still be on its way (`loading`: show a skeleton), arrive (`text`), or never
 * come (`none`: leave it out; the headline alone is better than an error).
 * A brief page (202 URHEILUSÄHKEET, D35) gives `briefs`: the page's own name
 * and its short news items, shown as a brief card instead of one item's text.
 */
export type LeadIngress =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | {
      kind: 'briefs';
      /** The page's name from its header row (`URHEILUSÄHKEET`); missing: use the index headline. */
      title?: string;
      /** Every brief on every subpage; never empty. */
      briefs: Brief[];
    };

export function leadIngress(
  state: Pick<PageState, 'status' | 'page'>,
  /** The headline the item is listed under; picks the story on a bulletin page. */
  headline?: string,
): LeadIngress {
  if (state.page) {
    const briefs = briefPage(state.page);
    if (briefs) return { kind: 'briefs', ...briefs };
    const text = ingress(state.page, headline);
    return text === undefined ? { kind: 'none' } : { kind: 'text', text };
  }
  return state.status === 'error' ? { kind: 'none' } : { kind: 'loading' };
}
