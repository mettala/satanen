import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { normalize } from '../parser/normalize';
import { feedList } from './feedList';
import { AT_TOP_PX, isAtTop, listUpdate, sameStories } from './listUpdate';

const here = fileURLToPath(new URL('.', import.meta.url));
function load(n: number) {
  const r = normalize(
    JSON.parse(readFileSync(resolve(here, `../../fixtures/pages/${n}.json`), 'utf8')),
  );
  if (!r.ok) throw new Error(`fixture ${n} does not normalise`);
  return r.page;
}

// Kotimaa from the real page 102 (10 stories, 103–113).
const SHOWN = feedList('kotimaa', { 102: load(102) });
const midList = { longAway: false, atTop: false };

describe('sameStories', () => {
  it('is true for an equal copy', () => {
    expect(sameStories(SHOWN, feedList('kotimaa', { 102: load(102) }))).toBe(true);
  });

  it('notices a new headline on a reused page number', () => {
    const next = SHOWN.map((i, k) => (k === 1 ? { ...i, headline: 'Uusi juttu' } : i));
    expect(sameStories(SHOWN, next)).toBe(false);
  });

  it('notices a new order', () => {
    expect(sameStories(SHOWN, [SHOWN[1]!, SHOWN[0]!, ...SHOWN.slice(2)])).toBe(false);
  });

  it('notices a story added or dropped', () => {
    expect(sameStories(SHOWN, SHOWN.slice(1))).toBe(false);
    expect(sameStories(SHOWN, [...SHOWN, { ...SHOWN[0]!, page: 114 }])).toBe(false);
  });

  it('ignores the section label (the story is its page and headline)', () => {
    expect(
      sameStories(
        SHOWN,
        SHOWN.map((i) => ({ ...i, section: 'other' as const })),
      ),
    ).toBe(true);
  });
});

describe('listUpdate', () => {
  const changed = SHOWN.slice(1);

  it('unchanged: nothing visible happens, wherever the reader is', () => {
    expect(listUpdate(SHOWN, [...SHOWN], midList)).toBe('same');
    expect(listUpdate(SHOWN, [...SHOWN], { longAway: true, atTop: true })).toBe('same');
  });

  it('changed, reader mid-list: offers the button', () => {
    expect(listUpdate(SHOWN, changed, midList)).toBe('offer');
  });

  it('changed, reader at the top: replaces', () => {
    expect(listUpdate(SHOWN, changed, { longAway: false, atTop: true })).toBe('replace');
  });

  it('changed, reader was away over 5 minutes: replaces even mid-list', () => {
    expect(listUpdate(SHOWN, changed, { longAway: true, atTop: false })).toBe('replace');
  });
});

describe('isAtTop', () => {
  it('allows a few pixels of slack', () => {
    expect(isAtTop(0)).toBe(true);
    expect(isAtTop(AT_TOP_PX)).toBe(true);
    expect(isAtTop(AT_TOP_PX + 1)).toBe(false);
    expect(isAtTop(900)).toBe(false);
  });
});
