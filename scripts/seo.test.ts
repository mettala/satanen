import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { fi } from '../src/i18n/fi';

const read = (file: string) => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');

describe('search and share metadata (D52, D53)', () => {
  const html = read('index.html');

  it('has a title, a description and a canonical link for the front page', () => {
    expect(html).toContain('<title>Satanen – Yle Teksti-TV modernina lukusovelluksena</title>');
    expect(html).toMatch(/name="description"\s+content="[^"]{60,160}"/);
    expect(html).toContain('<link rel="canonical" href="https://satanen.io/" />');
  });

  it('has the Open Graph tags LinkedIn needs, with an absolute https image', () => {
    for (const property of ['og:type', 'og:title', 'og:description', 'og:image']) {
      expect(html).toContain(`property="${property}"`);
    }
    expect(html).toContain('content="https://satanen.io/og-image.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('has no inline script (the CSP blocks it)', () => {
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
  });

  it('lets crawlers in and names the sitemap', () => {
    const robots = read('robots.txt');
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/Disallow/);
    expect(robots).toContain('Sitemap: https://satanen.io/sitemap.xml');
    expect(read('sitemap.xml')).toContain('<loc>https://satanen.io/</loc>');
  });

  it('does not hide the front page, robots.txt or sitemap.xml with a header rule', () => {
    expect(read('_headers')).not.toMatch(/X-Robots-Tag/i);
  });
});

describe('page titles', () => {
  it('names the page number', () => {
    expect(fi.common.pageTitle(105)).toBe('Sivu 105 – Satanen');
  });
});
