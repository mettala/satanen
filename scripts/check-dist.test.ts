import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  checkDist,
  checkEnvNames,
  checkSecretsInDist,
  checkSources,
  parseEnvFile,
} from './check-dist.mjs';

const hash = 'a'.repeat(32);

function dist(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'dist-'));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

describe('check-dist', () => {
  it('accepts a clean build', () => {
    const d = dist({
      'index.html': '',
      [`_expo/static/js/web/index-${hash}.js`]: 'x',
      'sw.js': '["/"]',
    });
    expect(checkDist(d)).toEqual([]);
  });
  it('rejects a preview chunk', () => {
    const d = dist({ [`_expo/static/js/web/preview-${hash}.js`]: 'x' });
    expect(checkDist(d).join()).toMatch(/preview-/);
  });
  it('rejects fixture json and images', () => {
    const d = dist({ 'assets/fixtures/pages/100.json': '{}', [`assets/100-${hash}.png`]: 'x' });
    expect(checkDist(d).filter((p: string) => p.includes('fixture'))).toHaveLength(2);
  });
  it('rejects a local proxy address', () => {
    const d = dist({ [`_expo/static/js/web/index-${hash}.js`]: 'fetch("http://localhost:8787")' });
    expect(checkDist(d).join()).toMatch(/local address/);
  });
  it('rejects a missing dist folder', () => {
    expect(checkDist(join(tmpdir(), 'no-such-dist-folder')).join()).toMatch(/missing/);
  });
  it('rejects a dist with no js files', () => {
    const d = dist({ 'index.html': '' });
    expect(checkDist(d).join()).toMatch(/no \.js files/);
  });
  it('rejects fixture paths in js', () => {
    const d = dist({
      [`_expo/static/js/web/index-${hash}.js`]: 'require("fixtures/pages/100.json")',
    });
    expect(checkDist(d).join()).toMatch(/fixture reference/);
  });
  it('rejects developer files in the service worker', () => {
    const d = dist({
      [`_expo/static/js/web/index-${hash}.js`]: 'x',
      'sw.js': `["/", "/_expo/static/js/web/preview-${hash}.js"]`,
    });
    expect(checkDist(d).join()).toMatch(/service worker/);
  });
  it('rejects Expo asset names for fixture images', () => {
    const d = dist({
      [`_expo/static/js/web/index-${hash}.js`]: 'x',
      [`assets/fixtures/images/100.${hash}.png`]: 'x',
    });
    expect(checkDist(d).length).toBeGreaterThan(0);
  });
});

describe('secrets guard', () => {
  it('parses env files', () => {
    expect(parseEnvFile('# c\nA=1\nexport B="two"\n\nC = x y \n')).toEqual({
      A: '1',
      B: 'two',
      C: 'x y',
    });
  });
  it('flags other EXPO_PUBLIC_ names in source, not the proxy one', () => {
    const d = dist({
      'app/a.tsx': 'process.env.EXPO_PUBLIC_PROXY_URL',
      'src/b.ts': 'process.env.EXPO_PUBLIC_YLE_APP_KEY',
    });
    const found = checkSources([join(d, 'app'), join(d, 'src'), join(d, 'missing')]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/b\.ts uses EXPO_PUBLIC_YLE_APP_KEY/);
  });
  it('the real app/ and src/ trees are clean', () => {
    expect(checkSources(['app', 'src'])).toEqual([]);
  });
  it('flags other EXPO_PUBLIC_ names in the environment or .env, by name only', () => {
    const found = checkEnvNames(
      { EXPO_PUBLIC_PROXY_URL: 'u', PATH: '/bin' },
      parseEnvFile('EXPO_PUBLIC_TOKEN=s3cretvalue\nEXPO_PUBLIC_PROXY_URL=x'),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/EXPO_PUBLIC_TOKEN/);
    expect(found.join()).not.toContain('s3cretvalue');
    expect(checkEnvNames({ EXPO_PUBLIC_PROXY_URL: 'u' }, {})).toEqual([]);
  });
  it('flags a secret value found in dist, naming the variable only', () => {
    const d = dist({
      [`_expo/static/js/web/index-${hash}.js`]: 'fetch("?k=abcd1234secret")',
    });
    const found = checkSecretsInDist(d, { YLE_APP_KEY: 'abcd1234secret', YLE_APP_ID: 'zzzzzzzz' });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/YLE_APP_KEY/);
    expect(found.join()).not.toContain('abcd1234secret');
  });
  it('ignores empty or very short secret values', () => {
    const d = dist({ 'a.js': 'abc' });
    expect(checkSecretsInDist(d, { A: '', B: 'abc' })).toEqual([]);
  });
});
