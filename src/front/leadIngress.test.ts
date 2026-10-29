import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { normalize } from '../parser/normalize';
import { leadIngress } from './leadIngress';

const here = fileURLToPath(new URL('.', import.meta.url));

function load(n: number) {
  const r = normalize(
    JSON.parse(readFileSync(resolve(here, `../../fixtures/pages/${n}.json`), 'utf8')),
  );
  if (!r.ok) throw new Error('bad fixture');
  return r.page;
}

describe('leadIngress', () => {
  it('is loading until the article arrives', () => {
    expect(leadIngress({ status: 'loading', page: null })).toEqual({ kind: 'loading' });
  });

  it('is left out when the article fails to load', () => {
    expect(leadIngress({ status: 'error', page: null })).toEqual({ kind: 'none' });
  });

  it('shows the first paragraph of the article', () => {
    const r = leadIngress({ status: 'ready', page: load(105) });
    expect(r.kind).toBe('text');
  });

  it('gives the briefs of a brief page (202), whatever headline it is listed under', () => {
    for (const headline of [undefined, 'HPK pestasi Mattias Tedenbyn']) {
      const r = leadIngress({ status: 'ready', page: load(202) }, headline);
      expect(r.kind).toBe('briefs');
      if (r.kind !== 'briefs') return;
      expect(r.title).toBe('URHEILUSÄHKEET');
      expect(r.briefs.map((b) => b.label)).toEqual([
        'PESÄPALLO',
        'AM.JALKAPALLO',
        'JALKAPALLO',
        'JÄÄKIEKKO',
      ]);
    }
  });

  it('articles still give their first paragraph, not briefs', () => {
    for (const n of [103, 104, 105, 109, 110, 136, 205]) {
      expect(leadIngress({ status: 'ready', page: load(n) }).kind).toBe('text');
    }
  });

  it('is left out when the lead page is not an article', () => {
    expect(leadIngress({ status: 'ready', page: load(102) })).toEqual({ kind: 'none' });
  });
});
