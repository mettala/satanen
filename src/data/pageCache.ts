// Copies of read pages kept on the device, so they still open without a
// connection (D14). We keep Yle's raw JSON, not the finished layout, so parser
// fixes also improve pages saved earlier.
//
// Keys: `satanen:v1:page:<n>` holds `{ fetchedAt, raw }` for one page, and
// `satanen:v1:pages` lists the saved page numbers, most recently read first.
// The list is what lets us drop the oldest copies without scanning storage.
//
// Nothing here throws: storage is a nice-to-have, the app works without it.

import { cleanPages, isValidPage } from '../storage/pages';
import { getStorageBackend, KEY_PREFIX, type StorageBackend } from '../storage/store';

// 80, not D14's 30: articles the feeds load must not push out the pages the
// reader opened themselves (D26). About 10 KB each, under 1 MB.
export const MAX_SAVED_PAGES = 80;
export const SAVED_LIST_KEY = `${KEY_PREFIX}pages`;

export function savedPageKey(n: number): string {
  return `${KEY_PREFIX}page:${n}`;
}

export interface SavedPage {
  /** The page JSON exactly as the proxy sent it. */
  raw: unknown;
  /** When this copy was fetched. */
  fetchedAt: Date;
}

// Saved page numbers, most recent first. Read from storage once, then kept here.
let savedList: number[] | null = null;
// Writes run one at a time so two pages saved together can't overwrite each other's list.
let queue: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function trySet(b: StorageBackend, key: string, value: string): Promise<boolean> {
  try {
    await b.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

async function tryRemove(b: StorageBackend, key: string): Promise<void> {
  try {
    await b.removeItem(key);
  } catch {
    // nothing more we can do
  }
}

async function readSavedList(b: StorageBackend): Promise<number[]> {
  if (savedList) return savedList;
  let list: number[] = [];
  try {
    const text = await b.getItem(SAVED_LIST_KEY);
    if (text != null) list = cleanPages(JSON.parse(text), Infinity) ?? [];
  } catch {
    // damaged or unreadable: start a new list
  }
  savedList = list;
  return list;
}

/** The saved copy of page `n`, or null if there is none or it is damaged. */
export async function loadSavedPage(n: number): Promise<SavedPage | null> {
  const b = getStorageBackend();
  if (!b || !isValidPage(n)) return null;
  try {
    const text = await b.getItem(savedPageKey(n));
    if (text == null) return null;
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null || !('raw' in data)) return null;
    const { raw, fetchedAt } = data as { raw: unknown; fetchedAt?: unknown };
    if (typeof fetchedAt !== 'string') return null;
    const date = new Date(fetchedAt);
    if (Number.isNaN(date.getTime())) return null;
    return { raw, fetchedAt: date };
  } catch {
    return null;
  }
}

/**
 * Saves the copy of page `n` and marks it the most recently read. Keeps the
 * newest MAX_SAVED_PAGES copies. If the write fails (usually storage full) it
 * drops the oldest copy and tries once more; after that it gives up quietly.
 * We can't reliably tell "full" apart from other write errors across web,
 * Android and iOS, so any failed write is treated as "full". The cost of being
 * wrong is one old copy gone.
 */
export function savePage(n: number, raw: unknown, fetchedAt: Date): Promise<void> {
  return oneAtATime(async () => {
    const b = getStorageBackend();
    if (!b || !isValidPage(n)) return;
    let text: string;
    try {
      text = JSON.stringify({ fetchedAt: fetchedAt.toISOString(), raw });
    } catch {
      return; // invalid date or JSON that can't be written
    }

    const before = await readSavedList(b);
    let list = [n, ...before.filter((p) => p !== n)];
    for (const p of list.slice(MAX_SAVED_PAGES)) await tryRemove(b, savedPageKey(p));
    list = list.slice(0, MAX_SAVED_PAGES);

    let saved = await trySet(b, savedPageKey(n), text);
    if (!saved && list.length > 1) {
      const oldest = list[list.length - 1]!;
      list = list.slice(0, -1);
      await tryRemove(b, savedPageKey(oldest));
      saved = await trySet(b, savedPageKey(n), text);
    }
    // A failed write leaves any earlier copy of `n` in place, so only forget
    // `n` if it had no copy before.
    if (!saved && !before.includes(n)) list = list.filter((p) => p !== n);

    savedList = list;
    await trySet(b, SAVED_LIST_KEY, JSON.stringify(list));
  }).catch(() => undefined);
}

/** Deletes every saved page copy (the settings screen's "delete saved pages"). */
export function clearSavedPages(): Promise<void> {
  return oneAtATime(async () => {
    const b = getStorageBackend();
    if (!b) return;
    const list = await readSavedList(b);
    for (const p of list) await tryRemove(b, savedPageKey(p));
    await tryRemove(b, SAVED_LIST_KEY);
    savedList = [];
  }).catch(() => undefined);
}

/** Forgets the in-memory list so the next call reads storage again. For tests. */
export function resetPageCacheMemory(): void {
  savedList = null;
}
