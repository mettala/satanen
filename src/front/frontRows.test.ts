import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { etusivuItems } from '../feed/footer';
import { normalize } from '../parser/normalize';
import { frontPage } from './frontPage';
import { frontRows } from './frontRows';

const here = fileURLToPath(new URL('.', import.meta.url));

function load(n: number) {
  const r = normalize(
    JSON.parse(readFileSync(resolve(here, `../../fixtures/pages/${n}.json`), 'utf8')),
  );
  if (!r.ok) throw new Error('bad fixture');
  return r.page;
}

describe('frontRows (page 100)', () => {
  const front = frontPage(load(100));
  const rows = frontRows(front);
  const items = etusivuItems(front);

  it('is the lead, then each group: its label, then its headlines', () => {
    const expected = ['lead'];
    for (const g of front.groups) expected.push('label', ...g.headlines.map(() => 'story'));
    expect(rows.map((r) => r.kind)).toEqual(expected);
  });

  it("gives each story its index in Etusivu's list (the order articles take next from)", () => {
    for (const row of rows) {
      if (row.kind === 'label') continue;
      expect(items[row.index]?.page).toBe(row.headline.page);
    }
  });

  it("points each label at its group's first story", () => {
    rows.forEach((row, i) => {
      if (row.kind !== 'label') return;
      const next = rows[i + 1];
      expect(next?.kind).toBe('story');
      expect(row.index).toBe(next?.index);
      expect(row.page).toBe(next?.kind === 'story' ? next.headline.page : undefined);
    });
  });

  it('has unique keys', () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('is empty with no lead', () => {
    expect(frontRows({ groups: [] })).toEqual([]);
  });
});
