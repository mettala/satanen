import { describe, expect, it } from 'vitest';

import type { ReaderBlock } from '../../parser/blocks';
import { splitSubpages } from './subpages';

describe('splitSubpages', () => {
  it('cuts at dividers', () => {
    const blocks: ReaderBlock[] = [
      { kind: 'heading', text: 'A' },
      { kind: 'subpageDivider', number: 2, count: 3, titles: [] },
      { kind: 'heading', text: 'B' },
      { kind: 'subpageDivider', number: 3, count: 3, titles: ['x'] },
    ];
    const parts = splitSubpages(blocks);
    expect(parts.map((p) => [p.number, p.blocks.length, !!p.divider])).toEqual([
      [1, 1, false],
      [2, 1, true],
      [3, 0, true],
    ]);
  });

  it('gives one empty subpage for no blocks', () => {
    expect(splitSubpages([])).toEqual([{ number: 1, blocks: [] }]);
  });
});
