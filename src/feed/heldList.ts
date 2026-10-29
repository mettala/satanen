import { LONG_AWAY_MS } from '../data/freshness';
import { AT_TOP_PX, isAtTop, listUpdate, type ListStory } from './listUpdate';

/**
 * A list shown on screen that new copies don't move by themselves (D39 A):
 * Etusivu holds page 100 with it. (The feeds keep the same rules inside the
 * feed store.) The first copy is shown at once; after that each new copy is
 * compared with the shown one by `listUpdate`, and either changes nothing
 * visible, replaces it, or waits behind "Päivitä lista" (`hasUpdate`) until
 * `apply()` or the reader scrolls to the top.
 */
export interface HeldList<T> {
  getState(): HeldListState<T>;
  subscribe(listener: () => void): () => void;
  /** A new copy arrived. */
  offer(next: T): void;
  /** The app was in the background this long (`foreground`). */
  noteAway(awayMs: number): void;
  /**
   * The list's scroll position. At the top, a waiting copy is shown. Scrolling
   * after coming back ends "away" (the reader is reading again).
   */
  setScrollY(y: number): void;
  /** "Päivitä lista": shows the waiting copy. */
  apply(): void;
}

export interface HeldListState<T> {
  /** What the screen shows; null until the first copy. */
  shown: T | null;
  /** A different copy waits behind "Päivitä lista". */
  hasUpdate: boolean;
  /** Counts replacements of a shown list, so the screen knows to scroll to the top. */
  replaced: number;
}

export function createHeldList<T>(storiesOf: (value: T) => readonly ListStory[]): HeldList<T> {
  const listeners = new Set<() => void>();
  let state: HeldListState<T> = { shown: null, hasUpdate: false, replaced: 0 };
  let pending: T | null = null;
  let scrollY = 0;
  let longAway = false;
  /** Where the list was when "away" started: scrolling away from there ends it. */
  let awayFromY = 0;

  function set(next: HeldListState<T>) {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function show(value: T, isReplace: boolean) {
    pending = null;
    set({
      shown: value,
      hasUpdate: false,
      replaced: isReplace ? state.replaced + 1 : state.replaced,
    });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    offer(next) {
      if (state.shown === null) {
        show(next, false);
        return;
      }
      if (next === state.shown) return;
      const decision = listUpdate(storiesOf(state.shown), storiesOf(next), {
        longAway,
        atTop: isAtTop(scrollY),
      });
      longAway = false;
      if (decision === 'same') show(next, false);
      else if (decision === 'replace') show(next, true);
      else {
        pending = next;
        if (!state.hasUpdate) set({ ...state, hasUpdate: true });
      }
    },
    noteAway(awayMs) {
      if (awayMs > LONG_AWAY_MS) {
        longAway = true;
        awayFromY = scrollY;
      }
    },
    setScrollY(y) {
      if (!Number.isFinite(y)) return;
      const next = Math.max(0, y);
      // Measured from where it was on return, so a slow drag in small steps counts too.
      if (Math.abs(next - awayFromY) > AT_TOP_PX) longAway = false;
      scrollY = next;
      if (isAtTop(scrollY) && pending !== null) show(pending, true);
    },
    apply() {
      if (pending !== null) show(pending, true);
    },
  };
}
