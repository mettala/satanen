import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const DEV_DIRS = ['app/dev/', 'src/dev/'];

function codeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return codeFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const files = [...codeFiles(join(ROOT, 'app')), ...codeFiles(join(ROOT, 'src'))].filter(
  (file) => !DEV_DIRS.some((dir) => relative(ROOT, file).startsWith(dir)),
);

const devAccess = [/\bt\s*\.\s*dev\b/, /\bt\s*\[\s*['"]dev['"]\s*\]/];

describe('production code does not read dev-preview strings', () => {
  it('has files to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('only the dev preview uses the dev namespace', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of devAccess) {
        expect(text, relative(ROOT, file)).not.toMatch(pattern);
      }
    }
  });
});
