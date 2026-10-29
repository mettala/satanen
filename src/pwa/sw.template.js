/* Satanen service worker (D18). Generated into dist/sw.js by scripts/build-sw.mts.
 * Keeps the app's own files only. Teletext data is never touched here: it comes
 * from the proxy (another origin) and offline copies are kept by usePage (D14). */
const CACHE = 'satanen-shell-__BUILD_ID__';
// eslint-disable-next-line no-undef -- filled in by scripts/build-sw.mts
const SHELL = __SHELL_URLS__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => keep(cache, url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Proxy and anything else on another origin: leave to the browser.
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

// A response that came through a redirect can't answer a page load, so copy it.
async function plain(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function keep(cache, url) {
  const response = await fetch(url, { cache: 'reload' });
  if (!response.ok) throw new Error('Could not keep ' + url);
  await cache.put(url, await plain(response));
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    // Every address returns the same single page, kept only under '/'.
    const type = response.headers.get('content-type') || '';
    if (response.ok && type.includes('text/html')) {
      const cache = await caches.open(CACHE);
      await cache.put('/', await plain(response.clone()));
    }
    return response;
  } catch (error) {
    const saved = await caches.match('/');
    if (saved) return saved;
    throw error;
  }
}

async function cacheFirst(request) {
  const saved = await caches.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const saved = await caches.match(request);
    if (saved) return saved;
    throw error;
  }
}
