/**
 * Where the section map is built from (Node only: scripts and tests).
 *
 * By default the committed `fixtures/pages/`. A script run can point at any
 * other folder holding `<n>.json` for every index page. Live pages are never
 * saved into the repo (see `scripts/build-section-map.mts`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { INDEX_PAGES } from './generate';

export function readIndexPages(rootDir: string, dir?: string): unknown[] {
  const source = dir ? resolve(dir) : resolve(rootDir, 'fixtures', 'pages');
  return INDEX_PAGES.map((page) =>
    JSON.parse(readFileSync(resolve(source, `${page}.json`), 'utf8')),
  );
}
