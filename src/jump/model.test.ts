import { describe, expect, it } from 'vitest';

import { MENU_SECTIONS } from '../sections/menu';
import { buildJumpModel, cleanDigits, isDeadEnd, rangeCode } from './model';

describe('cleanDigits', () => {
  it('keeps digits only and at most three', () => {
    expect(cleanDigits('2a3')).toBe('23');
    expect(cleanDigits('12345')).toBe('123');
    expect(cleanDigits(' - ')).toBe('');
  });
});

describe('isDeadEnd', () => {
  it('rejects first digits 0 and 9 and three-digit numbers outside 100-899', () => {
    expect(isDeadEnd('9')).toBe(true);
    expect(isDeadEnd('0')).toBe(true);
    expect(isDeadEnd('950')).toBe(true);
    expect(isDeadEnd('099')).toBe(true);
  });
  it('accepts anything that can still become a page', () => {
    expect(isDeadEnd('')).toBe(false);
    expect(isDeadEnd('1')).toBe(false);
    expect(isDeadEnd('8')).toBe(false);
    expect(isDeadEnd('100')).toBe(false);
    expect(isDeadEnd('899')).toBe(false);
  });
});

describe('rangeCode', () => {
  it('shortens ranges with x', () => {
    expect(rangeCode(200, 299)).toBe('2xx');
    expect(rangeCode(230, 239)).toBe('23x');
    expect(rangeCode(235, 235)).toBe('235');
  });
});

describe('buildJumpModel', () => {
  it('empty input lists the categories first, then favourites', () => {
    const m = buildJumpModel('', [235, 400]);
    expect(m.status).toBe('empty');
    expect(m.groups.map((g) => g.key)).toEqual(['categories', 'favourites']);
    expect(m.groups[0].rows.map((r) => r.page)).toEqual(MENU_SECTIONS.map((s) => s.page));
    expect(m.groups[1].rows.map((r) => r.page)).toEqual([235, 400]);
  });

  it('empty input with no favourites shows only the categories', () => {
    expect(buildJumpModel('', []).groups.map((g) => g.key)).toEqual(['categories']);
  });

  it('three valid digits jump', () => {
    expect(buildJumpModel('235', [])).toMatchObject({ status: 'jump', page: 235 });
    expect(buildJumpModel('100', [])).toMatchObject({ status: 'jump', page: 100 });
    expect(buildJumpModel('899', [])).toMatchObject({ status: 'jump', page: 899 });
  });

  it('out of range does not jump', () => {
    expect(buildJumpModel('950', []).status).toBe('invalid');
    expect(buildJumpModel('9', []).status).toBe('invalid');
    expect(buildJumpModel('050', []).status).toBe('invalid');
  });

  it('typing "2" puts matching favourites before the Urheilu group', () => {
    const m = buildJumpModel('2', [235, 105]);
    expect(m.status).toBe('typing');
    expect(m.groups[0]).toMatchObject({ key: 'favourites', title: 'Suosikeistasi' });
    expect(m.groups[0].rows.map((r) => r.page)).toEqual([235]);
    const sport = m.groups.find((g) => g.title === 'Urheilu · 2XX');
    expect(sport).toBeDefined();
    expect(sport!.rows[0]).toMatchObject({ code: '2xx', page: 200, range: '200–299' });
  });

  it('typing without favourites starts with the suggestion groups', () => {
    const m = buildJumpModel('2', []);
    expect(m.groups[0].title).toBe('Urheilu · 2XX');
  });

  it('narrower input narrows favourites and suggestions', () => {
    const m = buildJumpModel('23', [235, 240]);
    expect(m.groups[0].rows.map((r) => r.page)).toEqual([235]);
    for (const g of m.groups) for (const r of g.rows) expect(r.code.startsWith('23')).toBe(true);
  });
});
