import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createForeground } from './freshness';
import { createPageSource, type PageState } from './pageSource';

/** The one page source the whole app shares, so screens share requests. */
export const pageSource = createPageSource();

/** The app coming back to the foreground (D39 A); `watchForeground` feeds it. */
export const foreground = createForeground();

export interface UsePageResult extends PageState {
  /** Fetches the page again (pull to refresh). Never rejects. */
  refresh: () => Promise<void>;
}

/**
 * Loads teletext page `n` for a screen (D14): the device copy at once, then a
 * fresh one from the proxy. See `PageState` for what each field means.
 */
export function usePage(n: number): UsePageResult {
  const subscribe = useCallback((listener: () => void) => pageSource.subscribe(n, listener), [n]);
  const getSnapshot = useCallback(() => pageSource.getSnapshot(n), [n]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh = useCallback(() => pageSource.refresh(n), [n]);
  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
}
