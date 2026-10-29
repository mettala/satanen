/**
 * The small decisions behind a feed screen, as plain functions so they can be
 * tested without rendering (feedRules.test.ts).
 */
import type { PageErrorReason } from '../../api/client';
import type { FeedItem, FeedState } from '../../feed';
import type { ErrorKind } from '../states';

/** What fills the area under the header and chips. */
export type FeedBody = 'skeleton' | 'error' | 'empty' | 'list';

export function feedBody(state: Pick<FeedState, 'status' | 'items'>): FeedBody {
  if (state.status === 'loading') return 'skeleton';
  if (state.status === 'error') return 'error';
  return state.items.length > 0 ? 'list' : 'empty';
}

/**
 * The list has items but no story, only service pages (Talous on a Sunday,
 * D40): the feed says so in one line above them.
 */
export function onlyServices(items: readonly Pick<FeedItem, 'service'>[]): boolean {
  return items.length > 0 && items.every((i) => i.service);
}

/**
 * Which error message a feed with no list shows. A section index page that
 * answers "not found" is a short glitch at Yle (see feedStore.ts), so it gets
 * the "Yle ei vastaa" message, not "page not found".
 */
export function feedErrorKind(reason: PageErrorReason | null): ErrorKind {
  if (reason === 'offline') return 'offline';
  if (reason === 'bad-data') return 'badData';
  return 'upstream';
}

/** First and last index among the items on screen; null when none is known. */
export function visibleRange(
  indexes: readonly (number | null | undefined)[],
): { first: number; last: number } | null {
  let first = Infinity;
  let last = -Infinity;
  for (const i of indexes) {
    if (typeof i !== 'number' || !Number.isFinite(i)) continue;
    first = Math.min(first, i);
    last = Math.max(last, i);
  }
  return Number.isFinite(first) ? { first, last } : null;
}

/**
 * One step of putting a list back where the reader left it. The list grows as
 * its rows are drawn, so the saved position may not fit yet: scroll as far as
 * it goes now (`offset`) and keep trying until it fits (`done`).
 */
export function restoreStep(
  target: number,
  contentHeight: number,
  viewportHeight: number,
): { offset: number; done: boolean } {
  if (target <= 0) return { offset: 0, done: true };
  const max = Math.max(0, contentHeight - viewportHeight);
  return { offset: Math.min(target, max), done: viewportHeight > 0 && max >= target };
}
