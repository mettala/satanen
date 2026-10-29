import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { analysePage } from '../../parser/analyse';
import type { ReaderBlock } from '../../parser/blocks';
import type { PageAssessment } from '../../parser/confidence';
import { captionGroups, paragraphLinks, planSubpages } from './plan';

const base = { score: 1, lowConfidence: false, reasons: [] as never[] };
function assessment(fallbacks: boolean[], whole = false): PageAssessment {
  return {
    ...base,
    fallback: whole,
    subpages: fallbacks.map((fallback, i) => ({ ...base, number: i + 1, fallback, signals: [] })),
  };
}

const blocks: ReaderBlock[] = [
  { kind: 'heading', text: 'A' },
  { kind: 'subpageDivider', number: 2, count: 3, titles: [] },
  { kind: 'heading', text: 'B' },
  { kind: 'subpageDivider', number: 3, count: 3, titles: [] },
  { kind: 'heading', text: 'C' },
];

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.EXPO_PUBLIC_PROXY_URL;
  process.env.EXPO_PUBLIC_PROXY_URL = 'http://proxy.test';
});
afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_PROXY_URL;
  else process.env.EXPO_PUBLIC_PROXY_URL = saved;
});

describe('planSubpages', () => {
  it('gives each fallback subpage its own picture', () => {
    const plan = planSubpages(260, blocks, assessment([false, true, true]));
    expect(plan.map((p) => [p.number, p.fallback, p.imageUrl])).toEqual([
      [1, false, null],
      [2, true, 'http://proxy.test/v1/images/260/2.png'],
      [3, true, 'http://proxy.test/v1/images/260/3.png'],
    ]);
    expect(plan[0].blocks).toHaveLength(1);
    expect(plan[1].blocks).toEqual([]);
    expect(plan[1].divider?.number).toBe(2);
  });

  it('shows every subpage picture when the whole page falls back', () => {
    const plan = planSubpages(260, blocks, assessment([true, false, false], true));
    expect(plan.map((p) => p.imageUrl)).toEqual([
      'http://proxy.test/v1/images/260/1.png',
      'http://proxy.test/v1/images/260/2.png',
      'http://proxy.test/v1/images/260/3.png',
    ]);
  });

  it('keeps reader blocks when nothing falls back', () => {
    const plan = planSubpages(260, blocks, assessment([false, false, false]));
    expect(plan.every((p) => !p.fallback && p.imageUrl === null)).toBe(true);
  });
});

describe('first subpage counter', () => {
  it('adds 1/N to subpage 1 when there are several subpages', () => {
    const plan = planSubpages(260, blocks, assessment([false, false, false]));
    expect(plan.map((p) => p.divider && `${p.divider.number}/${p.divider.count}`)).toEqual([
      '1/3',
      '2/3',
      '3/3',
    ]);
    expect(plan[0].divider?.titles).toEqual([]);
    expect(plan[0].blocks).toHaveLength(1);
  });

  it('adds nothing to a single-subpage page', () => {
    const plan = planSubpages(260, [{ kind: 'heading', text: 'A' }], assessment([false]));
    expect(plan).toHaveLength(1);
    expect(plan[0].divider).toBeUndefined();
  });

  it('marks every subpage of every multi-subpage fixture once, and no single-subpage one', () => {
    const dir = resolve(__dirname, '../../../fixtures/pages');
    const multi: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const a = analysePage(JSON.parse(readFileSync(resolve(dir, file), 'utf8')));
      if (!a.ok) continue;
      const n = Number(file.replace('.json', ''));
      const plan = planSubpages(n, a.blocks, a.assessment);
      if (plan.length === 1) {
        expect(plan[0].divider, file).toBeUndefined();
        continue;
      }
      multi.push(`${n}(${plan.length})`);
      plan.forEach((p, i) => {
        expect([p.divider?.number, p.divider?.count], file).toEqual([i + 1, plan.length]);
        // The page's own text must not carry a second counter.
        expect(JSON.stringify(p.blocks), file).not.toMatch(/"\s*\d{1,2}\/\d{1,2}\s*"/);
      });
    }
    console.info(`multi-subpage fixtures: ${multi.join(' ')}`);
    expect(multi.length).toBeGreaterThan(0);
  });
});

describe('first subpage counter placement', () => {
  function plan(n: number) {
    const dir = resolve(__dirname, '../../../fixtures/pages');
    const a = analysePage(JSON.parse(readFileSync(resolve(dir, `${n}.json`), 'utf8')));
    if (!a.ok) throw new Error('not ok');
    return planSubpages(n, a.blocks, a.assessment)[0];
  }
  it('199 and 196: page title first, then 1/N', () => {
    for (const n of [199, 196]) {
      const p = plan(n);
      expect(p.dividerAt, String(n)).toBe(1);
      expect(p.blocks[0].kind).toBe('title');
      expect(p.divider?.number).toBe(1);
    }
  });
  it('176 and 184 (one name for the page): name first, then 1/N', () => {
    for (const n of [176, 184]) {
      const p = plan(n);
      expect(p.dividerAt, String(n)).toBe(1);
      expect(p.blocks[0].kind).toBe('title');
    }
  });
  it('425 and 301 (name changes per subpage): 1/N first, name under it', () => {
    for (const n of [425, 301]) {
      expect(plan(n).dividerAt, String(n)).toBe(0);
    }
  });
  it('no title before the marker on a page without a title (725)', () => {
    expect(plan(725).dividerAt).toBe(0);
  });
});

describe('paragraphLinks', () => {
  it('lists links once per target', () => {
    const page = { kind: 'page', page: 411 } as const;
    expect(
      paragraphLinks([
        { kind: 'text', text: 'Katso ' },
        { kind: 'link', text: '411', target: page },
        { kind: 'link', text: '411', target: page },
        { kind: 'link', text: 'yle.fi', target: { kind: 'url', href: 'yle.fi' } },
      ]).map((l) => l.text),
    ).toEqual(['411', 'yle.fi']);
  });
});

describe('captionGroups', () => {
  const list: ReaderBlock = { kind: 'linkList', variant: 'list', entries: [] };
  it('moves a caption below the letter heading, above the first entries', () => {
    const r = captionGroups(['Saamenkieliset uutiset:'], [{ kind: 'heading', text: 'S' }, list]);
    expect(r).toEqual({ titles: [], captions: ['Saamenkieliset uutiset:'], index: 1 });
  });
  it('keeps other divider lines and leaves subpages without a heading alone', () => {
    expect(captionGroups(['Otsikko'], [{ kind: 'heading', text: 'S' }, list]).titles).toEqual([
      'Otsikko',
    ]);
    expect(captionGroups(['Kuvaus:'], [list]).captions).toEqual([]);
    expect(captionGroups(['Kuvaus:'], [list]).titles).toEqual(['Kuvaus:']);
  });
});

describe('captionGroups on the fixtures', () => {
  it('only 197/3 gets a caption, above its links (index 1)', () => {
    const dir = resolve(__dirname, '../../../fixtures/pages');
    const found: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const a = analysePage(JSON.parse(readFileSync(resolve(dir, file), 'utf8')));
      if (!a.ok) continue;
      const n = Number(file.replace('.json', ''));
      for (const part of planSubpages(n, a.blocks, a.assessment)) {
        const c = captionGroups(part.divider?.titles ?? [], part.blocks);
        if (c.captions.length > 0) {
          found.push(`${n}/${part.number}`);
          expect(c.captions).toEqual(['Saamenkieliset uutiset:']);
          expect(c.index).toBe(1);
          expect(c.titles).toEqual([]);
          expect(part.blocks[0]).toEqual({ kind: 'heading', text: 'S' });
          expect(part.blocks[1].kind).toBe('linkList');
        }
      }
    }
    expect(found).toEqual(['197/3']);
  });
});
