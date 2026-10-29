import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { leadIngress, type LeadIngress } from '../../front/leadIngress';
import { normalize } from '../../parser/normalize';
import { BRIEFS_SHOWN, briefCardPlan } from './briefCard';

const here = fileURLToPath(new URL('.', import.meta.url));

function ingressOf(n: number): LeadIngress {
  const r = normalize(
    JSON.parse(readFileSync(resolve(here, `../../../fixtures/pages/${n}.json`), 'utf8')),
  );
  if (!r.ok) throw new Error('bad fixture');
  return leadIngress({ status: 'ready', page: r.page }, 'David Ezeh siirtyy HJK:sta KuPSiin');
}

const brief = (label: string) => ({ label, text: `${label} teksti.` });
const briefs = (n: number) => Array.from({ length: n }, (_, i) => brief(`AIHE${i + 1}`));

describe('briefCardPlan', () => {
  it('202: the page name as headline, 4 briefs counted, 3 shown and a "read all" row', () => {
    const ing = ingressOf(202);
    if (ing.kind !== 'briefs') throw new Error(`expected briefs, got ${ing.kind}`);
    const plan = briefCardPlan(ing, 'David Ezeh siirtyy HJK:sta KuPSiin');
    expect(plan.headline).toBe('Urheilusähkeet');
    expect(plan.count).toBe('4 sähkettä');
    expect(plan.rows.map((r) => r.label)).toEqual(['PESÄPALLO', 'AM.JALKAPALLO', 'JALKAPALLO']);
    expect(plan.rows[0].text.startsWith('Naisten Superpesiksen')).toBe(true);
    expect(plan.more).toBe(true);
    expect(plan.accessibilityLabel).toBe('Urheilusähkeet, 4 sähkettä');
  });

  it('one brief: singular count, no "read all" row', () => {
    const plan = briefCardPlan({ title: 'URHEILUSÄHKEET', briefs: briefs(1) }, 'Otsikko');
    expect(plan.count).toBe('1 sähke');
    expect(plan.rows).toHaveLength(1);
    expect(plan.more).toBe(false);
    expect(plan.accessibilityLabel).toBe('Urheilusähkeet, 1 sähke');
  });

  it(`exactly ${BRIEFS_SHOWN} briefs: all shown, no "read all" row`, () => {
    const plan = briefCardPlan({ title: 'URHEILUSÄHKEET', briefs: briefs(3) }, 'Otsikko');
    expect(plan.count).toBe('3 sähkettä');
    expect(plan.rows).toHaveLength(3);
    expect(plan.more).toBe(false);
  });

  it('more than 3: the first 3 shown, the count covers all', () => {
    const plan = briefCardPlan({ title: 'URHEILUSÄHKEET', briefs: briefs(7) }, 'Otsikko');
    expect(plan.count).toBe('7 sähkettä');
    expect(plan.rows.map((r) => r.label)).toEqual(['AIHE1', 'AIHE2', 'AIHE3']);
    expect(plan.more).toBe(true);
  });

  it('no page name: the index headline, unchanged', () => {
    const plan = briefCardPlan({ briefs: briefs(2) }, 'David Ezeh siirtyy HJK:sta KuPSiin');
    expect(plan.headline).toBe('David Ezeh siirtyy HJK:sta KuPSiin');
    expect(plan.accessibilityLabel).toBe('David Ezeh siirtyy HJK:sta KuPSiin, 2 sähkettä');
  });

  it('never shortens a brief text (the screen clamps it to one line)', () => {
    const ing = ingressOf(202);
    if (ing.kind !== 'briefs') throw new Error('expected briefs');
    const plan = briefCardPlan(ing, '');
    plan.rows.forEach((r, i) => expect(r.text).toBe(ing.briefs[i].text));
  });
});

describe('what an item shows while its page loads or fails', () => {
  // The feed item and Etusivu rows read these kinds (FeedView, FrontPageView).
  it('loading: skeleton under the index headline', () => {
    expect(leadIngress({ status: 'loading', page: null })).toEqual({ kind: 'loading' });
  });

  it('failed: the index headline only', () => {
    expect(leadIngress({ status: 'error', page: null })).toEqual({ kind: 'none' });
  });

  it('an article stays a first paragraph', () => {
    expect(ingressOf(205).kind).toBe('text');
  });
});
