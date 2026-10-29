import { cleanPages, isValidPage } from './pages';
import { createStore } from './store';

export const MAX_FAVOURITES = 50;

export const favouritesStore = createStore<number[]>('favourites', [], (raw) =>
  cleanPages(raw, MAX_FAVOURITES),
);

function move(list: number[], page: number, delta: number): number[] {
  const i = list.indexOf(page);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const favourites = {
  store: favouritesStore,
  add: (page: number) =>
    favouritesStore.update((list) =>
      !isValidPage(page) || list.includes(page) || list.length >= MAX_FAVOURITES
        ? list
        : [...list, page],
    ),
  remove: (page: number) => favouritesStore.update((list) => list.filter((p) => p !== page)),
  toggle: (page: number) =>
    favouritesStore.update((list) =>
      list.includes(page)
        ? list.filter((p) => p !== page)
        : !isValidPage(page) || list.length >= MAX_FAVOURITES
          ? list
          : [...list, page],
    ),
  moveUp: (page: number) => favouritesStore.update((list) => move(list, page, -1)),
  moveDown: (page: number) => favouritesStore.update((list) => move(list, page, 1)),
  has: (list: number[], page: number) => list.includes(page),
};
