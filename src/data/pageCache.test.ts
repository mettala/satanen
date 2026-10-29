import { beforeEach, describe, expect, it } from 'vitest';
import { setStorageBackend, type StorageBackend } from '../storage/store';
import { createMemoryBackend } from '../storage/testing';
import {
  clearSavedPages,
  loadSavedPage,
  MAX_SAVED_PAGES,
  resetPageCacheMemory,
  SAVED_LIST_KEY,
  savedPageKey,
  savePage,
} from './pageCache';

const AT = new Date('2026-10-22T11:32:00.000Z');

function fresh(initial: Record<string, string> = {}) {
  const b = createMemoryBackend(initial);
  setStorageBackend(b);
  resetPageCacheMemory();
  return b;
}
const list = (b: { data: Map<string, string> }) =>
  JSON.parse(b.data.get(SAVED_LIST_KEY) ?? '[]') as number[];

/** A backend that holds at most `capacity` page copies and fails like a full disk. */
function fullAfter(capacity: number) {
  const b = createMemoryBackend();
  const pages = () => [...b.data.keys()].filter((k) => k.startsWith('satanen:v1:page:')).length;
  const writes: string[] = [];
  const backend: StorageBackend & { data: Map<string, string>; writes: string[] } = {
    ...b,
    writes,
    async setItem(k, v) {
      writes.push(k);
      if (k.startsWith('satanen:v1:page:') && !b.data.has(k) && pages() >= capacity) {
        throw new Error('QuotaExceededError');
      }
      b.data.set(k, v);
    },
  };
  setStorageBackend(backend);
  resetPageCacheMemory();
  return backend;
}

describe('page copies on the device', () => {
  beforeEach(() => void fresh());

  it('saves the raw JSON and fetch time under satanen:v1:page:<n>', async () => {
    const b = fresh();
    await savePage(105, { page: { number: '105' } }, AT);
    expect(JSON.parse(b.data.get('satanen:v1:page:105')!)).toEqual({
      fetchedAt: '2026-10-22T11:32:00.000Z',
      raw: { page: { number: '105' } },
    });
    expect(list(b)).toEqual([105]);
    expect(await loadSavedPage(105)).toEqual({ raw: { page: { number: '105' } }, fetchedAt: AT });
  });

  it('returns null when there is no copy', async () => {
    expect(await loadSavedPage(200)).toBeNull();
  });

  it('keeps the most recently read first and moves a re-read page to the front', async () => {
    const b = fresh();
    await savePage(101, 1, AT);
    await savePage(102, 2, AT);
    await savePage(101, 3, AT);
    expect(list(b)).toEqual([101, 102]);
    expect((await loadSavedPage(101))?.raw).toBe(3);
  });

  it('keeps only the 80 most recently read pages', async () => {
    expect(MAX_SAVED_PAGES).toBe(80);
    const b = fresh();
    for (let p = 100; p < 100 + MAX_SAVED_PAGES + 5; p++) await savePage(p, p, AT);
    const saved = list(b);
    expect(saved).toHaveLength(MAX_SAVED_PAGES);
    expect(saved[0]).toBe(100 + MAX_SAVED_PAGES + 4);
    expect(b.data.has(savedPageKey(104))).toBe(false);
    expect(b.data.has(savedPageKey(105))).toBe(true);
    const pageKeys = [...b.data.keys()].filter((k) => k.startsWith('satanen:v1:page:'));
    expect(pageKeys).toHaveLength(MAX_SAVED_PAGES);
  });

  it('remembers the list across app starts', async () => {
    const b = fresh();
    await savePage(101, 1, AT);
    await savePage(102, 2, AT);
    resetPageCacheMemory();
    await savePage(103, 3, AT);
    expect(list(b)).toEqual([103, 102, 101]);
  });

  it('keeps the list right when pages are saved at the same time', async () => {
    const b = fresh();
    await Promise.all([savePage(101, 1, AT), savePage(102, 2, AT), savePage(103, 3, AT)]);
    expect(list(b)).toEqual([103, 102, 101]);
  });

  it('when storage is full, drops the oldest copy and retries once', async () => {
    const b = fullAfter(3);
    await savePage(101, 1, AT);
    await savePage(102, 2, AT);
    await savePage(103, 3, AT);
    await savePage(104, 4, AT);
    expect(list(b)).toEqual([104, 103, 102]);
    expect(b.data.has(savedPageKey(101))).toBe(false);
    expect((await loadSavedPage(104))?.raw).toBe(4);
    expect(b.writes.filter((k) => k === savedPageKey(104))).toHaveLength(2);
  });

  it('gives up quietly when the retry fails too', async () => {
    const b = fullAfter(2);
    await savePage(101, 1, AT);
    await savePage(102, 2, AT);
    const real = b.setItem;
    let attempts = 0;
    b.setItem = (k, v) => {
      if (k !== savedPageKey(103)) return real(k, v);
      attempts++;
      return Promise.reject(new Error('full'));
    };
    await expect(savePage(103, 3, AT)).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(list(b)).toEqual([102]);
    expect(await loadSavedPage(103)).toBeNull();
  });

  it('does not retry when there is nothing older to drop', async () => {
    const b = fullAfter(0);
    await expect(savePage(101, 1, AT)).resolves.toBeUndefined();
    expect(b.writes.filter((k) => k === savedPageKey(101))).toHaveLength(1);
    expect(list(b)).toEqual([]);
  });

  it('keeps an older copy listed when replacing it fails', async () => {
    const b = fresh();
    await savePage(101, 1, AT);
    await savePage(102, 2, AT);
    b.setItem = () => Promise.reject(new Error('full'));
    await savePage(102, 3, AT);
    // 101 was dropped to make room; 102's earlier copy is still there.
    expect(b.data.has(savedPageKey(101))).toBe(false);
    expect((await loadSavedPage(102))?.raw).toBe(2);
  });

  it('ignores damaged copies', async () => {
    fresh({
      [savedPageKey(101)]: '{oops',
      [savedPageKey(102)]: '{"raw":1}',
      [savedPageKey(103)]: '{"raw":1,"fetchedAt":"yesterday"}',
      [savedPageKey(104)]: '"text"',
      [SAVED_LIST_KEY]: '{"not":"a list"}',
    });
    for (const p of [101, 102, 103, 104]) expect(await loadSavedPage(p)).toBeNull();
    await savePage(105, 5, AT);
    expect((await loadSavedPage(105))?.raw).toBe(5);
  });

  it('ignores invalid page numbers and dates', async () => {
    const b = fresh();
    await savePage(99, 1, AT);
    await savePage(101, 1, new Date('x'));
    expect(b.data.size).toBe(0);
    expect(await loadSavedPage(900)).toBeNull();
  });

  it('never throws when storage fails or is missing', async () => {
    setStorageBackend({
      getItem: () => Promise.reject(new Error('x')),
      setItem: () => Promise.reject(new Error('x')),
      removeItem: () => Promise.reject(new Error('x')),
    });
    resetPageCacheMemory();
    await expect(savePage(101, 1, AT)).resolves.toBeUndefined();
    await expect(loadSavedPage(101)).resolves.toBeNull();
    await expect(clearSavedPages()).resolves.toBeUndefined();
    setStorageBackend(null);
    await expect(savePage(101, 1, AT)).resolves.toBeUndefined();
    await expect(loadSavedPage(101)).resolves.toBeNull();
  });

  it('clearSavedPages deletes every copy and the list, and leaves other data', async () => {
    const b = fresh({ 'satanen:v1:favourites': '[101]' });
    await savePage(101, 1, AT);
    await savePage(102, 2, AT);
    await clearSavedPages();
    expect([...b.data.keys()]).toEqual(['satanen:v1:favourites']);
    expect(await loadSavedPage(101)).toBeNull();
    await savePage(103, 3, AT);
    expect(list(b)).toEqual([103]);
  });
});
