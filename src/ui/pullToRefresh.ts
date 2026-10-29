// Pure maths of the web pull-to-refresh gesture (the touch wiring is in usePullToRefresh.tsx).

/** How far the indicator must be pulled, in px, before letting go refreshes. */
export const PULL_THRESHOLD = 40;
/** The indicator never travels further than this. */
export const PULL_MAX = 110;

/**
 * How far the indicator is pulled for a finger that moved `dy` px down since the
 * touch began. Zero unless the list sits at its very top; the finger moves further
 * than the indicator, so it feels heavy like the native one.
 */
export function pullDistance(dy: number, scrollTop: number): number {
  if (scrollTop > 0 || dy <= 0) return 0;
  return Math.min(PULL_MAX, dy * 0.5);
}

/** True when letting go at this pull distance should refresh. */
export function shouldRefresh(pull: number): boolean {
  return pull >= PULL_THRESHOLD;
}
