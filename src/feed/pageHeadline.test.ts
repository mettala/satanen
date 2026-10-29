import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { normalize } from '../parser/normalize';
import { pageHeadline } from './pageHeadline';

const here = fileURLToPath(new URL('.', import.meta.url));

function load(n: number) {
  const r = normalize(
    JSON.parse(readFileSync(resolve(here, `../../fixtures/pages/${n}.json`), 'utf8')),
  );
  if (!r.ok) throw new Error('bad fixture');
  return r.page;
}

describe('pageHeadline', () => {
  it('is the article heading as printed', () => {
    expect(pageHeadline(load(105))).toBe('Yksi kuoli Jyväskylän palossa');
    expect(pageHeadline(load(136))).toBe('Putin valmis neuvotteluihin');
  });

  it('is undefined for an index page and for a bulletin page', () => {
    expect(pageHeadline(load(102))).toBeUndefined();
    expect(pageHeadline(load(202))).toBeUndefined();
  });
});
