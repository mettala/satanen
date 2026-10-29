import { beforeEach, describe, expect, it } from 'vitest';
import { favourites, favouritesStore, MAX_FAVOURITES } from './favourites';
import { recent, recentStore, MAX_RECENT } from './recent';
import { settings, settingsStore } from './settings';
import { setStorageBackend } from './store';
import { createMemoryBackend } from './testing';

const stores = [favouritesStore, recentStore, settingsStore];
function fresh(initial: Record<string, string> = {}) {
  const b = createMemoryBackend(initial);
  setStorageBackend(b);
  stores.forEach((s) => s.reset());
  return b;
}
const fav = () => favouritesStore.getSnapshot();

describe('favourites', () => {
  beforeEach(() => void fresh());

  it('starts empty', async () => {
    await favouritesStore.ready();
    expect(fav()).toEqual([]);
  });
  it('adds in order, no duplicates', async () => {
    await favourites.add(300);
    await favourites.add(105);
    await favourites.add(300);
    expect(fav()).toEqual([300, 105]);
  });
  it('rejects pages outside 100-899', async () => {
    for (const p of [99, 900, 1000, 100.5, NaN]) await favourites.add(p);
    await favourites.add(100);
    await favourites.add(899);
    expect(fav()).toEqual([100, 899]);
  });
  it('caps at 50', async () => {
    for (let p = 100; p < 160; p++) await favourites.add(p);
    expect(fav()).toHaveLength(MAX_FAVOURITES);
    await favourites.toggle(500);
    expect(fav()).not.toContain(500);
  });
  it('removes', async () => {
    await favourites.add(101);
    await favourites.add(102);
    await favourites.remove(101);
    await favourites.remove(555);
    expect(fav()).toEqual([102]);
  });
  it('toggles on and off, ignoring invalid pages', async () => {
    await favourites.toggle(222);
    expect(fav()).toEqual([222]);
    await favourites.toggle(222);
    expect(fav()).toEqual([]);
    await favourites.toggle(5);
    expect(fav()).toEqual([]);
  });
  it('moves up and down, stopping at the ends', async () => {
    for (const p of [101, 102, 103]) await favourites.add(p);
    await favourites.moveUp(103);
    expect(fav()).toEqual([101, 103, 102]);
    await favourites.moveUp(101);
    expect(fav()).toEqual([101, 103, 102]);
    await favourites.moveDown(101);
    expect(fav()).toEqual([103, 101, 102]);
    await favourites.moveDown(102);
    await favourites.moveUp(777);
    expect(fav()).toEqual([103, 101, 102]);
  });
  it('persists and reloads', async () => {
    const b = fresh();
    await favourites.add(104);
    expect(b.data.get('satanen:v1:favourites')).toBe('[104]');
    favouritesStore.reset();
    await favouritesStore.ready();
    expect(fav()).toEqual([104]);
  });
  it('has() checks membership', () => {
    expect(favourites.has([101], 101)).toBe(true);
    expect(favourites.has([101], 102)).toBe(false);
  });
});

describe('recent', () => {
  beforeEach(() => void fresh());

  it('puts newest first and moves repeats to the front', async () => {
    await recent.add(101);
    await recent.add(102);
    await recent.add(101);
    expect(recentStore.getSnapshot()).toEqual([101, 102]);
  });
  it('keeps the last 20', async () => {
    for (let p = 100; p < 130; p++) await recent.add(p);
    const list = recentStore.getSnapshot();
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe(129);
  });
  it('ignores invalid pages and clears', async () => {
    await recent.add(42);
    expect(recentStore.getSnapshot()).toEqual([]);
    await recent.add(300);
    await recent.clear();
    expect(recentStore.getSnapshot()).toEqual([]);
  });
});

describe('settings', () => {
  beforeEach(() => void fresh());

  it('defaults to system theme', async () => {
    await settingsStore.ready();
    expect(settingsStore.getSnapshot()).toEqual({ theme: 'system' });
  });
  it('sets and persists theme', async () => {
    const b = fresh();
    await settings.setTheme('dark');
    expect(settingsStore.getSnapshot().theme).toBe('dark');
    expect(JSON.parse(b.data.get('satanen:v1:settings')!)).toEqual({ theme: 'dark' });
  });
  it('ignores an invalid theme', async () => {
    await settings.setTheme('pink' as never);
    expect(settingsStore.getSnapshot().theme).toBe('system');
  });
});

describe('corrupt or missing data', () => {
  it('falls back to defaults on non-JSON', async () => {
    fresh({ 'satanen:v1:favourites': '{oops', 'satanen:v1:settings': 'nope' });
    await favouritesStore.ready();
    await settingsStore.ready();
    expect(fav()).toEqual([]);
    expect(settingsStore.getSnapshot()).toEqual({ theme: 'system' });
  });
  it('falls back on wrong shape', async () => {
    fresh({
      'satanen:v1:favourites': '{"a":1}',
      'satanen:v1:recent': '"x"',
      'satanen:v1:settings': '5',
    });
    await Promise.all(stores.map((s) => s.ready()));
    expect(fav()).toEqual([]);
    expect(recentStore.getSnapshot()).toEqual([]);
    expect(settingsStore.getSnapshot().theme).toBe('system');
  });
  it('cleans bad entries inside a list', async () => {
    fresh({ 'satanen:v1:favourites': '[101, "x", 5, 101, 900, 202, null]' });
    await favouritesStore.ready();
    expect(fav()).toEqual([101, 202]);
  });
  it('trims an oversized stored list', async () => {
    fresh({ 'satanen:v1:recent': JSON.stringify(Array.from({ length: 40 }, (_, i) => 100 + i)) });
    await recentStore.ready();
    expect(recentStore.getSnapshot()).toHaveLength(MAX_RECENT);
  });
  it('uses an unknown theme value as system', async () => {
    fresh({ 'satanen:v1:settings': '{"theme":"pink"}' });
    await settingsStore.ready();
    expect(settingsStore.getSnapshot().theme).toBe('system');
  });
  it('does not throw when the backend fails', async () => {
    setStorageBackend({
      getItem: () => Promise.reject(new Error('x')),
      setItem: () => Promise.reject(new Error('x')),
      removeItem: () => Promise.reject(new Error('x')),
    });
    favouritesStore.reset();
    await favourites.add(123);
    expect(fav()).toEqual([123]);
  });
});

describe('subscriptions', () => {
  it('notifies on change and stops after unsubscribe', async () => {
    fresh();
    await favouritesStore.ready();
    let calls = 0;
    const off = favouritesStore.subscribe(() => calls++);
    await favourites.add(150);
    expect(calls).toBeGreaterThan(0);
    const before = calls;
    off();
    await favourites.add(151);
    expect(calls).toBe(before);
  });
});
