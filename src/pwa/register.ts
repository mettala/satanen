import { Platform } from 'react-native';

/**
 * Registers the offline service worker (D18). Only in production web builds:
 * not in `npm run web` (__DEV__) and not on native, where there is no browser.
 */
export function registerServiceWorker(): void {
  if (Platform.OS !== 'web' || __DEV__) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus; the app works without it.
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
