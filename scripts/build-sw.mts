/**
 * Writes dist/sw.js: the service worker template with a build id and the list
 * of files to keep. Run after `expo export` by `npm run build:web` (D18).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderServiceWorker, selectShellUrls } from '../src/pwa/shellFiles.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const files = walk(dist).map((f) => relative(dist, f));
const urls = selectShellUrls(files);
if (!urls.includes('/')) {
  throw new Error('dist/index.html is missing; run the web export first');
}

// Build id: changes whenever the page or any kept file name changes.
const buildId = createHash('sha256')
  .update(readFileSync(join(dist, 'index.html')))
  .update(urls.join('\n'))
  .digest('hex')
  .slice(0, 12);

const template = readFileSync(join(root, 'src/pwa/sw.template.js'), 'utf8');
writeFileSync(join(dist, 'sw.js'), renderServiceWorker(template, buildId, urls));
console.log(`dist/sw.js written: build ${buildId}, ${urls.length} files kept`);
