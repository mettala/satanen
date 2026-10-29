import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = __dirname;

function textFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return textFiles(p);
    return /\.(json|md|txt|xml)$/.test(e.name) ? [p] : [];
  });
}

const files = textFiles(ROOT);

describe('fixtures contain no secrets', () => {
  it('has fixture files to scan', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('never mentions app_id or app_key as a query parameter', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      // README explains the rule in prose, so only look for "name=" forms.
      expect(text, f).not.toMatch(/app_(id|key)\s*=/);
      if (f.endsWith('.json')) {
        expect(text, f).not.toContain('app_id');
        expect(text, f).not.toContain('app_key');
      }
    }
  });

  it('does not contain the real key values when they are in the environment', () => {
    const values = [process.env.YLE_APP_ID, process.env.YLE_APP_KEY].filter(
      (v): v is string => !!v && v.length >= 4,
    );
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const v of values) expect(text.includes(v), f).toBe(false);
    }
  });
});
