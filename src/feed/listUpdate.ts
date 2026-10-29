/**
 * What to do with a re-fetched list while another one is on screen (D39 A):
 * lists (the feeds and Etusivu) are never swapped under the reader's finger.
 *
 * - `same`: the same stories in the same order. Nothing visible happens.
 * - `replace`: the reader was away over 5 minutes, or is at the top of the
 *   list, so the new list simply takes the old one's place.
 * - `offer`: the stories differ and the reader is somewhere down the list:
 *   the "Päivitä lista" button appears, and the swap waits for it (or for the
 *   reader to scroll to the top).
 *
 * A story is its page number and headline: a page number Yle reuses for a new
 * story is a new story.
 */

/** Scrolled less than this from the top still counts as "at the top". */
export const AT_TOP_PX = 8;

export type ListUpdate = 'same' | 'replace' | 'offer';

export interface ListStory {
  page: number;
  headline: string;
}

export const storyKey = (item: ListStory): string => `${item.page}|${item.headline}`;

/** Same stories in the same order. */
export function sameStories(a: readonly ListStory[], b: readonly ListStory[]): boolean {
  return a.length === b.length && a.every((item, i) => storyKey(item) === storyKey(b[i]!));
}

export function listUpdate(
  shown: readonly ListStory[],
  incoming: readonly ListStory[],
  reader: { longAway: boolean; atTop: boolean },
): ListUpdate {
  if (sameStories(shown, incoming)) return 'same';
  return reader.longAway || reader.atTop ? 'replace' : 'offer';
}

export function isAtTop(scrollY: number): boolean {
  return !(scrollY > AT_TOP_PX);
}
