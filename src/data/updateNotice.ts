import type { Page } from '../parser/model';

/**
 * "Sivu päivitetty" (D39 A): when a single page on screen is replaced by a
 * copy whose text differs, the screen shows the new text at once and this
 * message for `UPDATED_NOTICE_MS`. A copy with the same text (a re-fetch that
 * found nothing new) shows nothing. Plain functions with a pluggable timer, so
 * the rule is tested with a fake clock; `useUpdateNotice` is the React side.
 */

/** How long "Sivu päivitetty" stays on screen. */
export const UPDATED_NOTICE_MS = 5_000;

/**
 * The page's text, row by row, every subpage. Colours, links and Yle's
 * last-modified time are left out: the message is about the words changing.
 */
export function pageText(page: Page): string {
  return page.subpages.map((sub) => sub.lines.map((line) => line.text).join('\n')).join('\n\f\n');
}

export interface UpdateNoticeState {
  visible: boolean;
  /** Goes up by one each time the message (re)starts, so its bar starts over. */
  count: number;
}

export interface UpdateNotice {
  getState(): UpdateNoticeState;
  subscribe(listener: () => void): () => void;
  /** The page the screen now shows (null while it has none). */
  show(page: Page | null): void;
  /** The screen is going away: stop the timer. */
  dispose(): void;
}

export interface UpdateNoticeOptions {
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createUpdateNotice({
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: UpdateNoticeOptions = {}): UpdateNotice {
  const listeners = new Set<() => void>();
  let state: UpdateNoticeState = { visible: false, count: 0 };
  let shown: { page: Page; number: number; text: string } | null = null;
  let timer: unknown = null;

  function set(next: UpdateNoticeState) {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function stop() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    show(page) {
      if (!page || page === shown?.page) return;
      const text = pageText(page);
      const changed = shown !== null && shown.number === page.number && shown.text !== text;
      shown = { page, number: page.number, text };
      if (!changed) return;
      stop();
      set({ visible: true, count: state.count + 1 });
      timer = setTimer(() => {
        timer = null;
        set({ ...state, visible: false });
      }, UPDATED_NOTICE_MS);
    },
    dispose: stop,
  };
}
