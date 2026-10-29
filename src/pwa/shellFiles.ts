/**
 * Pure helpers for the offline app shell (D18): which built files the service
 * worker keeps, and how the final sw.js text is made from the template.
 * Used by scripts/build-sw.mts, tested in shellFiles.test.ts.
 */

/** Files in dist/ that are never kept (the worker itself, host config, debug maps). */
const SKIPPED = new Set(['sw.js', '_headers', '_redirects', 'metadata.json']);

/**
 * Hashed files under /assets/ the app needs to draw itself: the upright
 * Schibsted Grotesk weights it loads, and the Ionicons icon font. Dev
 * fixtures and unused icon fonts are left out.
 */
const NEEDED_ASSET =
  /\/(SchibstedGrotesk_(?:400Regular|500Medium|600SemiBold|700Bold|800ExtraBold)|Ionicons)\.[0-9a-f]+\.ttf$/;

/**
 * Turns paths relative to dist/ (any slash style) into the URLs the worker
 * keeps: the app page, the manifest, icons and everything under /_expo/static/.
 * Sorted and without duplicates, so the same build always gives the same list.
 */
export function selectShellUrls(relativePaths: readonly string[]): string[] {
  const urls = new Set<string>();
  for (const raw of relativePaths) {
    const path = raw.replace(/\\/g, '/').replace(/^\.?\/+/, '');
    if (!path || SKIPPED.has(path) || path.endsWith('.map')) continue;
    if (path === 'index.html') {
      // Kept only as '/': hosting redirects /index.html to /, and a redirected
      // response can't be used to answer a page load.
      urls.add('/');
    } else if (
      path === 'manifest.webmanifest' ||
      path === 'favicon.ico' ||
      path.startsWith('icons/') ||
      path.startsWith('_expo/static/') ||
      (path.startsWith('assets/') && NEEDED_ASSET.test(path))
    ) {
      // Same form the browser asks for: "[page]" stays as typed, spaces become %20.
      urls.add(new URL('/' + path, 'https://shell.invalid').pathname);
    }
  }
  return [...urls].sort();
}

/** Fills the worker template. The list is embedded as JSON so it can't break the script. */
export function renderServiceWorker(
  template: string,
  buildId: string,
  urls: readonly string[],
): string {
  return template
    .replace('__BUILD_ID__', () => buildId.replace(/[^\w-]/g, ''))
    .replace('__SHELL_URLS__', () => JSON.stringify(urls));
}
