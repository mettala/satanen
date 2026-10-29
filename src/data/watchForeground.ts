import { AppState, Platform } from 'react-native';

import { TICK_MS, type Foreground } from './freshness';

/**
 * Tells `foreground` when the app is on screen: the tab's `visibilitychange`
 * on the web, `AppState` on Android and iOS. Also ticks it every `TICK_MS`
 * (ignored while hidden) and, on the web, when the browser is back online.
 * Returns the function that stops watching.
 */
export function watchForeground(foreground: Foreground): () => void {
  const timer = setInterval(() => foreground.tick(), TICK_MS);

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return () => clearInterval(timer);
    const onVisibility = () => foreground.setVisible(document.visibilityState !== 'hidden');
    const onOnline = () => foreground.tick();
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }

  foreground.setVisible(AppState.currentState !== 'background');
  const sub = AppState.addEventListener('change', (state) => {
    // iOS passes through "inactive" (app switcher, a call banner): not away yet.
    if (state === 'active') foreground.setVisible(true);
    else if (state === 'background') foreground.setVisible(false);
  });
  return () => {
    clearInterval(timer);
    sub.remove();
  };
}
