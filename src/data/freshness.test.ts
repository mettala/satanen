import { describe, expect, it } from 'vitest';

import {
  createForeground,
  LIST_LIMIT_MS,
  limitFromHeader,
  MAX_LIMIT_MS,
  PAGE_LIMIT_MS,
  pageLimitMs,
  refetchesOnTimer,
} from './freshness';

describe('limitFromHeader', () => {
  it('turns seconds into milliseconds', () => {
    expect(limitFromHeader('60')).toBe(60_000);
    expect(limitFromHeader('240')).toBe(240_000);
    expect(limitFromHeader(' 30 ')).toBe(30_000);
  });

  it('returns null for missing, zero, negative or non-numeric values', () => {
    for (const v of [null, undefined, '', '0', '-5', 'abc', '12s', '1e3', 'NaN', 'Infinity']) {
      expect(limitFromHeader(v)).toBeNull();
    }
  });

  it('cuts huge values to the maximum', () => {
    expect(limitFromHeader('86400')).toBe(MAX_LIMIT_MS);
    expect(limitFromHeader('99999999999999999999')).toBe(MAX_LIMIT_MS);
  });
});

describe('refetchesOnTimer', () => {
  it('covers headline lists whatever their limit', () => {
    expect(refetchesOnTimer(100)).toBe(true);
    expect(refetchesOnTimer(100, 240_000)).toBe(true);
  });

  it('covers live pages, i.e. a limit of 120 s or less', () => {
    expect(refetchesOnTimer(221, 60_000)).toBe(true);
    expect(refetchesOnTimer(221, 30_000)).toBe(true);
  });

  it('leaves articles and other pages to the return check', () => {
    expect(refetchesOnTimer(105)).toBe(false);
    expect(refetchesOnTimer(105, 300_000)).toBe(false);
    expect(refetchesOnTimer(400, 1_800_000)).toBe(false);
  });

  it('keeps a live page whose limit was doubled under load (120 s)', () => {
    expect(refetchesOnTimer(221, 120_000)).toBe(true);
    expect(refetchesOnTimer(221, 300_000)).toBe(false);
  });
});

describe('pageLimitMs (the defaults when the proxy sends no limit)', () => {
  it('gives headline lists 2 minutes', () => {
    for (const n of [100, 102, 130, 160, 200, 201]) expect(pageLimitMs(n)).toBe(LIST_LIMIT_MS);
    expect(LIST_LIMIT_MS).toBe(2 * 60_000);
  });

  it('gives everything else 5 minutes', () => {
    for (const n of [103, 105, 131, 161, 202, 235, 400, 890]) {
      expect(pageLimitMs(n)).toBe(PAGE_LIMIT_MS);
    }
    expect(PAGE_LIMIT_MS).toBe(5 * 60_000);
  });
});

describe('createForeground', () => {
  function setup() {
    const clock = { now: 1_000_000 };
    const fg = createForeground({ now: () => clock.now });
    const seen: number[] = [];
    fg.subscribe((away) => seen.push(away));
    return { clock, fg, seen };
  }

  it('reports how long the app was hidden when it comes back', () => {
    const { clock, fg, seen } = setup();
    fg.setVisible(false);
    clock.now += 9 * 60 * 60_000;
    fg.setVisible(true);
    expect(seen).toEqual([9 * 60 * 60_000]);
  });

  it('ignores repeats of the same state', () => {
    const { clock, fg, seen } = setup();
    fg.setVisible(true); // starts visible
    fg.setVisible(false);
    clock.now += 1000;
    fg.setVisible(false);
    clock.now += 1000;
    fg.setVisible(true);
    fg.setVisible(true);
    expect(seen).toEqual([2000]);
  });

  it('ticks as 0 ms away, and not at all while hidden', () => {
    const { fg, seen } = setup();
    fg.tick();
    fg.setVisible(false);
    fg.tick();
    expect(seen).toEqual([0]);
    expect(fg.isVisible()).toBe(false);
  });

  it('a broken listener does not stop the others', () => {
    const { fg, seen } = setup();
    fg.subscribe(() => {
      throw new Error('broken');
    });
    const later: number[] = [];
    fg.subscribe((a) => later.push(a));
    fg.tick();
    expect(seen).toEqual([0]);
    expect(later).toEqual([0]);
  });
});
