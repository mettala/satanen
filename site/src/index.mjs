// Serves the built web app (D17). Files come from the static assets binding;
// this code only decides what to do when a file is missing.
import { classify } from './route.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;
    if (classify(url.pathname) === 'asset') return res;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    // Unknown path: hand out the app; it decides what to show. The browser's
    // conditional and range headers belong to the unknown path, not to "/",
    // so they are dropped; otherwise a 304 would turn into an empty page.
    const headers = new Headers(request.headers);
    for (const h of [
      'If-None-Match',
      'If-Modified-Since',
      'If-Match',
      'If-Unmodified-Since',
      'Range',
    ]) {
      headers.delete(h);
    }
    const index = await env.ASSETS.fetch(new Request(new URL('/', url), { headers }));
    // Search engines may list only the front page (D53), so every other path is noindex.
    const out = new Headers(index.headers);
    out.set('X-Robots-Tag', 'noindex');
    return new Response(request.method === 'HEAD' ? null : index.body, {
      status: index.status,
      headers: out,
    });
  },
};
