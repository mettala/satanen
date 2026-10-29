import { describe, expect, it } from 'vitest';

import worker from './index.mjs';

// A stand-in for the static assets binding: only "/" and one real file exist.
const env = {
  ASSETS: {
    async fetch(request: Request) {
      const path = new URL(request.url).pathname;
      if (path === '/' || path === '/robots.txt') {
        return new Response(path === '/' ? '<div id="root"></div>' : 'User-agent: *', {
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('not found', { status: 404 });
    },
  },
};

const get = (path: string, method = 'GET') =>
  worker.fetch(new Request(`https://satanen.io${path}`, { method }), env) as Promise<Response>;

describe('X-Robots-Tag (D53)', () => {
  it('leaves the front page and real files without noindex', async () => {
    expect((await get('/')).headers.get('x-robots-tag')).toBeNull();
    expect((await get('/robots.txt')).headers.get('x-robots-tag')).toBeNull();
  });

  it('marks the app served for any other path as noindex', async () => {
    for (const path of ['/105', '/asetukset', '/nope']) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('id="root"');
      expect(res.headers.get('x-robots-tag')).toBe('noindex');
    }
    expect((await get('/105', 'HEAD')).headers.get('x-robots-tag')).toBe('noindex');
  });
});
