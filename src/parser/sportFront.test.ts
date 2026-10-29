import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { t } from '../i18n';
import { toReaderBlocks, type LinkListBlock, type ReaderBlock } from './blocks';
import { normalize } from './normalize';
import { SPORT_CARDS, sportFront } from './sportFront';

const file = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../fixtures/pages/200.json');
const parsed = normalize(JSON.parse(readFileSync(file, 'utf8')));
if (!parsed.ok) throw new Error('fixture 200 does not parse');
const front = sportFront(toReaderBlocks(parsed.page), t.sport);

const lists = (variant: 'bar' | 'list') =>
  front.filter((b): b is LinkListBlock => b.kind === 'linkList' && b.variant === variant);
const entriesOf = (b: ReaderBlock | undefined) => (b as LinkListBlock).entries;
const pages = (es: LinkListBlock['entries']) =>
  es.map((e) =>
    e.target.kind === 'page' ? e.target.page : e.target.kind === 'range' ? e.target.from : -1,
  );

describe('sportFront (Urheilu, 200)', () => {
  it('has the owner cards in order: Uutiset, SM-liiga, NHL, F1, Ralli, Eurojalkapallo 670, Suurtapahtumat', () => {
    expect(lists('bar')).toHaveLength(1);
    const cards = entriesOf(lists('bar')[0]);
    expect(cards.map((c) => [c.label, c.linkText])).toEqual([
      ['Uutiset', '201'],
      ['SM-liiga', '223'],
      ['NHL', '237'],
      ['F1', '298'],
      ['Ralli', '299'],
      ['Eurojalkapallo', '670'],
      ['Suurtapahtumat', '600'],
    ]);
  });

  it('no longer has Palloilu as a card, but as list row 220', () => {
    expect(entriesOf(lists('bar')[0]).some((c) => c.label === 'Palloilu')).toBe(false);
    const row = entriesOf(lists('list')[0]).find((e) => e.linkText === '220');
    expect(row?.label).toBe('Palloilu');
  });

  it('sorts the list by page number (a real sort, over Yle row order)', () => {
    const list = pages(entriesOf(lists('list')[0]));
    expect(list).toEqual([...list].sort((a, b) => a - b));
    // Yle's own order is 223, 263, 226…: it must have changed.
    expect(list.slice(0, 4)).toEqual([201, 220, 223, 226]);
  });

  it('has a list row for every card page, once, and the named rows win over Yle names', () => {
    const list = entriesOf(lists('list')[0]);
    for (const [page] of SPORT_CARDS) {
      expect(list.filter((e) => e.linkText === String(page))).toHaveLength(1);
    }
    const label = (p: string) => list.find((e) => e.linkText === p)?.label;
    expect(label('201')).toBe('Uutiset');
    expect(label('223')).toBe('Jääkiekkoliiga');
    expect(label('237')).toBe('NHL-taulukot');
    expect(label('298')).toBe('F1');
    expect(label('299')).toBe('Ralli');
    expect(label('600')).toBe('Urheilun suurtapahtumat');
    expect(label('670')).toBe('Eurojalkapallo');
  });

  it("drops Yle's stale 650 and keeps Yle's other rows", () => {
    const list = entriesOf(lists('list')[0]);
    expect(list.some((e) => e.linkText === '650')).toBe(false);
    expect(list.some((e) => e.linkText === '263')).toBe(true);
    expect(list.some((e) => e.linkText === '282-284')).toBe(true);
  });

  it('still shows the cards and rows if Yle sends no links at all', () => {
    const out = sportFront([{ kind: 'title', text: 'Urheilu' }], t.sport);
    expect(out.map((b) => b.kind)).toEqual(['title', 'linkList', 'linkList']);
  });
});
