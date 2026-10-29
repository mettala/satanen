/** Small pure rules for the favourites list (M3.15). No React Native imports. */
import type { PageErrorReason } from '../../api/client';
import { t } from '../../i18n';

/** Which move buttons work for the item at `index` in a list of `length`. */
export function moveFlags(index: number, length: number): { up: boolean; down: boolean } {
  return { up: index > 0, down: index >= 0 && index < length - 1 };
}

/** Edit mode only makes sense while there is something to edit. */
export function isEditing(editing: boolean, length: number): boolean {
  return editing && length > 0;
}

/** Short sentence for a card whose page could not be loaded and has no copy. */
export function unavailableText(reason: PageErrorReason | null): string {
  switch (reason) {
    case 'not-found':
      return t.states.notFoundTitle;
    case 'offline':
      return t.states.offlineTitle;
    case 'bad-data':
      return t.stateKit.badDataTitle;
    default:
      return t.stateKit.upstreamTitle;
  }
}
