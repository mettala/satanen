import { useSyncExternalStore } from 'react';
import type { Store } from './store';

/** Reads a store and re-renders when it changes. */
export function useStored<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
