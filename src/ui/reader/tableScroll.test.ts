import { describe, expect, it } from 'vitest';

import { tableEdges } from './tableScroll';

describe('tableEdges (scroll cue on wide tables, RP.9)', () => {
  it('shows nothing when the table fits (390 px screen, 40 columns)', () => {
    expect(tableEdges(342, 313, 0)).toEqual({ left: false, right: false });
    expect(tableEdges(313, 313.5, 0)).toEqual({ left: false, right: false });
  });

  it('cues the right edge when columns are cut off (320 px screen)', () => {
    expect(tableEdges(272, 313, 0)).toEqual({ left: false, right: true });
  });

  it('moves the cue as the reader scrolls', () => {
    expect(tableEdges(272, 313, 20)).toEqual({ left: true, right: true });
    expect(tableEdges(272, 313, 41)).toEqual({ left: true, right: false });
  });

  it('shows nothing before the widths are measured', () => {
    expect(tableEdges(0, 313, 0)).toEqual({ left: false, right: false });
    expect(tableEdges(272, 0, 0)).toEqual({ left: false, right: false });
  });
});
