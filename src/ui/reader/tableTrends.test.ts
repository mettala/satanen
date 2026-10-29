import { describe, expect, it } from 'vitest';

import type { TableBlock } from '../../parser/blocks';
import { marksByLine, rowLabel, rowParts } from './tableTrends';

const row = 'ODINEMER1   21,62 EUR 22  -2,03  +21,62';
const down = { line: 2, column: 26, length: 5, trend: 'down' as const };
const up = { line: 2, column: 33, length: 6, trend: 'up' as const };

describe('table rows with coloured price changes (RP.13)', () => {
  it('cuts the row at the marks and keeps every character', () => {
    const parts = rowParts(row, [up, down]);
    expect(parts).toEqual([
      { text: 'ODINEMER1   21,62 EUR 22  ' },
      { text: '-2,03', trend: 'down' },
      { text: '  ' },
      { text: '+21,62', trend: 'up' },
    ]);
    expect(parts.map((p) => p.text).join('')).toBe(row);
  });

  it('leaves a row without marks whole, and skips marks that do not fit', () => {
    expect(rowParts(row, [])).toEqual([{ text: row }]);
    expect(rowParts('', [])).toEqual([{ text: '' }]);
    expect(rowParts(row, [{ ...up, column: 38 }])).toEqual([{ text: row }]);
    expect(
      rowParts(row, [down, { ...down, column: 28 }])
        .map((p) => p.text)
        .join(''),
    ).toBe(row);
  });

  it('groups the marks by line', () => {
    const block: TableBlock = { kind: 'table', lines: ['', '', row], trends: [down, up] };
    expect(marksByLine(block)).toEqual(new Map([[2, [down, up]]]));
    expect(marksByLine({ kind: 'table', lines: [row] })).toEqual(new Map());
  });

  it('says the direction after each change for screen readers', () => {
    expect(rowLabel(rowParts(row, [down, up]), { up: 'nousu', down: 'lasku' })).toBe(
      'ODINEMER1 21,62 EUR 22 -2,03 lasku +21,62 nousu',
    );
  });
});
