import { cleanPages, isValidPage } from './pages';
import { createStore } from './store';

export const MAX_RECENT = 20;

export const recentStore = createStore<number[]>('recent', [], (raw) =>
  cleanPages(raw, MAX_RECENT),
);

export const recent = {
  store: recentStore,
  /** Records an opened page: newest first, no duplicates, last 20 kept. */
  add: (page: number) =>
    recentStore.update((list) =>
      isValidPage(page) ? [page, ...list.filter((p) => p !== page)].slice(0, MAX_RECENT) : list,
    ),
  clear: () => recentStore.set([]),
};
