import { refetchesOnTimer, type Foreground } from '../data/freshness';
import type { PageSource } from '../data/pageSource';
import type { FeedStore } from './feedStore';

/**
 * When the app comes back to the foreground (D39 A): the page or feed on the
 * screen in front is fetched again, quietly, if it is older than its limit,
 * through the one page source (D14), so screens showing the same page still
 * share one request. On every timer tick while the app stays open, only the
 * lists in front are (`refetchesOnTimer`: lists and live pages): an article is checked again when
 * the reader comes back or returns to it. Screens behind the front one and
 * hidden tabs wait until they come to the front (`focus`). Returns the
 * function that disconnects it.
 */
export function connectRefreshOnReturn(
  foreground: Foreground,
  source: Pick<PageSource, 'revalidateShown'>,
  feeds: Pick<FeedStore, 'revalidate'>,
): () => void {
  return foreground.subscribe((awayMs, reason) => {
    // Feeds first, so a feed marks the reader as away before its pages answer.
    feeds.revalidate(awayMs);
    source.revalidateShown(reason === 'tick' ? refetchesOnTimer : undefined);
  });
}
