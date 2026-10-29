import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { renderServiceWorker, selectShellUrls } from './shellFiles';

const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');

describe('selectShellUrls', () => {
  it('keeps the page, manifest, icons and hashed static files', () => {
    const urls = selectShellUrls([
      'index.html',
      'manifest.webmanifest',
      'icons/icon-192.png',
      '_expo/static/js/web/entry-abc123.js',
      'assets/fonts/x.ttf',
    ]);
    expect(urls).toEqual([
      '/',
      '/_expo/static/js/web/entry-abc123.js',
      '/icons/icon-192.png',
      '/manifest.webmanifest',
    ]);
  });

  it('leaves out the worker itself, host config and source maps', () => {
    const urls = selectShellUrls([
      'sw.js',
      '_headers',
      'metadata.json',
      '_expo/static/js/a.js.map',
      'index.html',
    ]);
    expect(urls).toEqual(['/']);
  });

  it('accepts Windows slashes, dedupes and sorts', () => {
    const urls = selectShellUrls([
      '_expo\\static\\js\\b.js',
      '_expo/static/js/a.js',
      '_expo/static/js/a.js',
    ]);
    expect(urls).toEqual(['/_expo/static/js/a.js', '/_expo/static/js/b.js']);
  });

  it('writes names the way the browser requests them', () => {
    expect(
      selectShellUrls(['_expo/static/js/web/[page]-b9ef52b4.js', '_expo/static/media/a b.ttf']),
    ).toEqual(['/_expo/static/js/web/[page]-b9ef52b4.js', '/_expo/static/media/a%20b.ttf']);
  });

  it('keeps only the fonts the app needs from /assets/', () => {
    const fonts = '@expo-google-fonts/schibsted-grotesk';
    const urls = selectShellUrls([
      `assets/node_modules/${fonts}/400Regular/SchibstedGrotesk_400Regular.6ae39f16.ttf`,
      `assets/node_modules/${fonts}/800ExtraBold/SchibstedGrotesk_800ExtraBold.11c23c12.ttf`,
      `assets/node_modules/${fonts}/400Regular_Italic/SchibstedGrotesk_400Regular_Italic.009a9916.ttf`,
      'assets/node_modules/@expo/vector-icons/build/Fonts/Ionicons.b4eb097d.ttf',
      'assets/node_modules/@expo/vector-icons/build/Fonts/Feather.ca4b48e0.ttf',
      'assets/fixtures/images/100.e9a65931.png',
    ]);
    expect(urls).toEqual([
      `/assets/node_modules/${fonts}/400Regular/SchibstedGrotesk_400Regular.6ae39f16.ttf`,
      `/assets/node_modules/${fonts}/800ExtraBold/SchibstedGrotesk_800ExtraBold.11c23c12.ttf`,
      '/assets/node_modules/@expo/vector-icons/build/Fonts/Ionicons.b4eb097d.ttf',
    ]);
  });

  it('keeps the page only as "/" (hosting redirects /index.html)', () => {
    expect(selectShellUrls(['index.html'])).toEqual(['/']);
  });
});

describe('renderServiceWorker', () => {
  it('fills in the build id and file list and leaves no placeholders', () => {
    const out = renderServiceWorker(template, 'abc', ['/']);
    expect(out).toContain("'satanen-shell-abc'");
    expect(out).toContain('const SHELL = ["/"];');
    expect(out).not.toContain('__');
    expect(() => new Function(out)).not.toThrow();
  });
});

describe('service worker template rules', () => {
  it('ignores other origins and non-GET requests', () => {
    expect(template).toContain("request.method !== 'GET'");
    expect(template).toContain('url.origin !== self.location.origin');
  });

  it('rebuilds redirected responses and serves /assets/ cache-first', () => {
    expect(template).toContain('response.redirected');
    expect(template).toContain("url.pathname.startsWith('/assets/')");
  });

  it('deletes old caches on activate', () => {
    expect(template).toContain('caches.delete(k)');
  });
});
