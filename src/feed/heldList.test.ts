import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { LONG_AWAY_MS } from '../data/freshness';
import { frontPage } from '../front/frontPage';
import type { Page } from '../parser/model';
import { normalize } from '../parser/normalize';
import { etusivuItems } from './footer';
import { createHeldList } from './heldList';

// Etusivu holds page 100 (the real fixture, and a copy where Yle changed one headline).
const here = fileURLToPath(new URL('.', import.meta.url));
function load(edit?: [string, string]): Page {
  let body = readFileSync(resolve(here, '../../fixtures/pages/100.json'), 'utf8');
  if (edit) {
    if (!body.includes(edit[0])) throw new Error(`page 100 has no "${edit[0]}"`);
    body = body.split(edit[0]).join(edit[1]);
  }
  const r = normalize(JSON.parse(body));
  if (!r.ok) throw new Error('page 100 does not normalise');
  return r.page;
}

const stories = (page: Page) => etusivuItems(frontPage(page));
const FIRST = load();
const SAME = load();
const headline = stories(FIRST)[1]!.headline;
const CHANGED = load([headline, headline.split('').reverse().join('')]);

function setup() {
  const held = createHeldList(stories);
  held.offer(FIRST);
  let changes = 0;
  held.subscribe(() => changes++);
  return { held, changes: () => changes };
}

describe('Etusivu holds page 100 (D39 A)', () => {
  it('fixture check: the edited copy really is a different list', () => {
    expect(stories(CHANGED)).not.toEqual(stories(FIRST));
    expect(stories(SAME)).toEqual(stories(FIRST));
  });

  it('shows the first copy at once', () => {
    const held = createHeldList(stories);
    held.offer(FIRST);
    expect(held.getState()).toEqual({ shown: FIRST, hasUpdate: false, replaced: 0 });
  });

  it('an unchanged copy mid-list: no button, nothing replaced', () => {
    const { held } = setup();
    held.setScrollY(500);
    held.offer(SAME);
    expect(held.getState()).toMatchObject({ hasUpdate: false, replaced: 0 });
  });

  it('a changed copy mid-list waits behind the button', () => {
    const { held } = setup();
    held.setScrollY(500);
    held.offer(CHANGED);
    expect(held.getState()).toMatchObject({ shown: FIRST, hasUpdate: true, replaced: 0 });
    held.apply();
    expect(held.getState()).toMatchObject({ shown: CHANGED, hasUpdate: false, replaced: 1 });
  });

  it('scrolling back to the top shows the waiting copy', () => {
    const { held } = setup();
    held.setScrollY(500);
    held.offer(CHANGED);
    held.setScrollY(0);
    expect(held.getState()).toMatchObject({ shown: CHANGED, hasUpdate: false });
  });

  it('a changed copy at the top replaces at once', () => {
    const { held } = setup();
    held.offer(CHANGED);
    expect(held.getState()).toMatchObject({ shown: CHANGED, hasUpdate: false, replaced: 1 });
  });

  it('after more than 5 minutes away, a changed copy replaces even mid-list, once', () => {
    const { held } = setup();
    held.setScrollY(500);
    held.noteAway(LONG_AWAY_MS + 1);
    held.offer(CHANGED);
    expect(held.getState()).toMatchObject({ shown: CHANGED, hasUpdate: false, replaced: 1 });
    // The next change while the reader stays is offered again.
    held.offer(FIRST);
    expect(held.getState()).toMatchObject({ shown: CHANGED, hasUpdate: true });
  });

  it('scrolling after coming back ends "away": a copy arriving later waits behind the button', () => {
    const { held } = setup();
    held.setScrollY(500);
    held.noteAway(9 * 60 * 60_000); // overnight; the first fetch fails, so no copy yet
    held.setScrollY(900); // the reader is reading again
    held.offer(CHANGED); // the network is back
    expect(held.getState()).toMatchObject({ shown: FIRST, hasUpdate: true, replaced: 0 });
  });

  it('a slow drag in small steps after coming back also ends "away"', () => {
    const { held } = setup();
    held.setScrollY(500);
    held.noteAway(9 * 60 * 60_000);
    for (let i = 1; i <= 30; i++) held.setScrollY(500 + i * 3); // 3 px per scroll event
    held.offer(CHANGED);
    expect(held.getState()).toMatchObject({ shown: FIRST, hasUpdate: true, replaced: 0 });
  });

  it('the list putting itself back in place is not the reader scrolling', () => {
    const { held } = setup();
    held.setScrollY(500);
    held.noteAway(LONG_AWAY_MS + 1);
    held.setScrollY(503);
    held.offer(CHANGED);
    expect(held.getState()).toMatchObject({ shown: CHANGED, replaced: 1 });
  });

  it('a short time away does not count', () => {
    const { held } = setup();
    held.setScrollY(500);
    held.noteAway(LONG_AWAY_MS);
    held.offer(CHANGED);
    expect(held.getState().hasUpdate).toBe(true);
  });

  it('the same object again changes nothing', () => {
    const { held, changes } = setup();
    held.offer(FIRST);
    expect(changes()).toBe(0);
  });
});
