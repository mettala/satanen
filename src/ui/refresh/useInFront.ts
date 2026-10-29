import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { pageSource } from '../../data';
import { feedStore, type FeedId } from '../../feed';

/**
 * Page `n` is on the screen in front while this screen is focused (D39 A):
 * only then is it checked when the reader returns, and on coming back to the
 * front it is checked if past its limit. Screens behind it in the stack and
 * hidden tabs are left alone, to spare Yle's request budget.
 */
export function usePageInFront(n: number): void {
  useFocusEffect(useCallback(() => pageSource.focus(n), [n]));
}

/** The same for a feed list. */
export function useFeedInFront(id: FeedId): void {
  useFocusEffect(useCallback(() => feedStore.focus(id), [id]));
}
