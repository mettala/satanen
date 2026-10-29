import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Sets the browser tab title while the screen is open and puts the old one back when it closes.
 * Web only (native apps have no `document`). `null` leaves the title alone.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || title === null) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
