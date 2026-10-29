import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { pageSource } from '../data';
import type { FeedId } from './feedList';
import { createFeedStore, type FeedState, type ListId } from './feedStore';

/**
 * The app's one feed store, on the app's one page source (D14), so feeds share
 * requests and saved copies with every other screen. It lives as long as the
 * app (or the web page), so a list screen that is taken down and built again
 * gets the same snapshot back (D27).
 */
export const feedStore = createFeedStore({ source: pageSource });

export interface UseFeedResult extends FeedState {
  /** Builds a new list from fresh index pages (refresh button, pull to refresh). Never rejects. */
  refresh: () => Promise<void>;
  /** Report the items on screen (indexes into `items`). */
  setVisible: (first: number, last: number) => void;
  /** Save the list's scroll position, to restore it with `scrollY()`. */
  setScrollY: (y: number) => void;
  /** The saved scroll position for this feed, 0 if none. */
  scrollY: () => number;
  /** Shows the list waiting behind "Päivitä lista" (`hasUpdate`). */
  applyUpdate: () => void;
}

/** The snapshot of feed `id` (built on first use) and what a list screen does with it. */
export function useFeed(id: FeedId): UseFeedResult {
  const subscribe = useCallback((listener: () => void) => feedStore.subscribe(id, listener), [id]);
  const getSnapshot = useCallback(() => feedStore.getState(id), [id]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const actions = useMemo(
    () => ({
      refresh: () => feedStore.refresh(id),
      setVisible: (first: number, last: number) => feedStore.setVisible(id, first, last),
      setScrollY: (y: number) => feedStore.setScrollY(id, y),
      scrollY: () => feedStore.scrollY(id),
      applyUpdate: () => feedStore.applyUpdate(id),
    }),
    [id],
  );
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}

/**
 * A list's state without the feed actions: Etusivu uses it for its first
 * paragraphs (its items come from page 100 through `feedStore.registerList`).
 */
export function useListState(id: ListId): FeedState {
  const subscribe = useCallback((listener: () => void) => feedStore.subscribe(id, listener), [id]);
  const getSnapshot = useCallback(() => feedStore.getState(id), [id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
