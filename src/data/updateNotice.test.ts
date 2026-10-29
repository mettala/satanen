import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Page } from '../parser/model';
import { normalize } from '../parser/normalize';
import { createUpdateNotice, pageText, UPDATED_NOTICE_MS } from './updateNotice';

const here = fileURLToPath(new URL('.', import.meta.url));
function load(n: number, edit?: [string, string]): Page {
  let body = readFileSync(resolve(here, `../../fixtures/pages/${n}.json`), 'utf8');
  if (edit) body = body.split(edit[0]).join(edit[1]);
  const r = normalize(JSON.parse(body));
  if (!r.ok) throw new Error(`fixture ${n} does not normalise`);
  return r.page;
}

const ARTICLE = load(105);
const CHANGED = load(105, ['Yksi kuoli Jyväskylän palossa ', 'Kaksi kuoli Jyväskylän palossa']);
// Only Yle's last-modified time differs: the words are the same.
const RETIMED = load(105, ['2026-10-21T06:08:42', '2026-10-21T06:30:00']);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('pageText', () => {
  it('changes when the words change, not when only the time does', () => {
    expect(pageText(CHANGED)).not.toBe(pageText(ARTICLE));
    expect(RETIMED.time).not.toBe(ARTICLE.time);
    expect(pageText(RETIMED)).toBe(pageText(ARTICLE));
  });

  it('covers every subpage', () => {
    const page = load(100);
    expect(page.subpages.length).toBeGreaterThan(1);
    const last = page.subpages
      .at(-1)!
      .lines.map((l) => l.text)
      .join('\n');
    expect(pageText(page)).toContain(last);
  });
});

describe('"Sivu päivitetty"', () => {
  it('shows for 5 s when the text on screen is replaced by different text', () => {
    const notice = createUpdateNotice();
    notice.show(ARTICLE);
    expect(notice.getState().visible).toBe(false);
    notice.show(CHANGED);
    expect(notice.getState()).toEqual({ visible: true, count: 1 });
    vi.advanceTimersByTime(UPDATED_NOTICE_MS - 1);
    expect(notice.getState().visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(notice.getState().visible).toBe(false);
  });

  it('never shows for a copy with the same text', () => {
    const notice = createUpdateNotice();
    notice.show(ARTICLE);
    notice.show(load(105));
    notice.show(RETIMED);
    expect(notice.getState()).toEqual({ visible: false, count: 0 });
  });

  it('never shows for the first copy, or when the screen moves to another page', () => {
    const notice = createUpdateNotice();
    notice.show(null);
    notice.show(ARTICLE);
    notice.show(load(102));
    expect(notice.getState().visible).toBe(false);
  });

  it('a second change while it shows starts the 5 s over', () => {
    const notice = createUpdateNotice();
    notice.show(ARTICLE);
    notice.show(CHANGED);
    vi.advanceTimersByTime(4000);
    notice.show(ARTICLE);
    expect(notice.getState()).toEqual({ visible: true, count: 2 });
    vi.advanceTimersByTime(4000);
    expect(notice.getState().visible).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(notice.getState().visible).toBe(false);
  });

  it('stops its timer when the screen goes away', () => {
    const notice = createUpdateNotice();
    const seen: boolean[] = [];
    notice.subscribe(() => seen.push(notice.getState().visible));
    notice.show(ARTICLE);
    notice.show(CHANGED);
    notice.dispose();
    vi.advanceTimersByTime(UPDATED_NOTICE_MS);
    expect(seen).toEqual([true]);
  });
});
