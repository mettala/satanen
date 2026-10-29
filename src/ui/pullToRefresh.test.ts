import { describe, expect, it } from 'vitest';

import { PULL_MAX, pullDistance, shouldRefresh } from './pullToRefresh';

describe('pullDistance', () => {
  it('is zero when the list is scrolled away from the top', () => {
    expect(pullDistance(200, 30)).toBe(0);
  });
  it('is zero for an upward or still finger', () => {
    expect(pullDistance(0, 0)).toBe(0);
    expect(pullDistance(-40, 0)).toBe(0);
  });
  it('moves at half the finger distance and stops at the maximum', () => {
    expect(pullDistance(80, 0)).toBe(40);
    expect(pullDistance(1000, 0)).toBe(PULL_MAX);
  });
});

describe('shouldRefresh', () => {
  it('needs a deliberate pull, not a small touch', () => {
    expect(shouldRefresh(pullDistance(20, 0))).toBe(false);
    expect(shouldRefresh(pullDistance(150, 0))).toBe(true);
  });
});
