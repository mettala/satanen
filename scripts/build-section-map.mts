/**
 * Builds src/sections/sectionMap.generated.ts from the index pages.
 *
 * `npm run section-map` builds from the committed fixtures/pages/.
 * `npm run section-map -- --pages-dir <folder>` builds from <folder>/<n>.json.
 * `npm run section-map -- --live [--url <proxy>]` fetches the pages through
 * the proxy (no key needed) and builds from them in memory: the fetched Yle
 * pages are never written to disk, so they cannot end up in git. It writes
 * nothing if any page fails or the map shrinks below 80 %.
 *
 * Needs the ts-loader hook so Node can resolve the extensionless imports
 * inside src/*.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildEntries, renderSectionMap } from '../src/sections/generate.ts';
import { readIndexPages } from '../src/sections/indexSource.ts';
import { DEFAULT_PROXY_URL, fetchLiveIndex } from '../src/sections/live.ts';
import { SECTION_MAP } from '../src/sections/sectionMap.generated.ts';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const outPath = resolve(rootDir, 'src', 'sections', 'sectionMap.generated.ts');

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--pages-dir') && !argValue(args, '--pages-dir')) {
    console.error('--pages-dir needs a folder, for example: --pages-dir fixtures/pages');
    process.exit(2);
  }
  let entries;
  if (args.includes('--live')) {
    const baseUrl = argValue(args, '--url') || DEFAULT_PROXY_URL;
    const result = await fetchLiveIndex(fetch, baseUrl, SECTION_MAP.length);
    if (!result.ok) {
      console.error(`Live refresh aborted, nothing written: ${result.reason}`);
      process.exit(1);
    }
    entries = result.entries;
  } else {
    entries = buildEntries(readIndexPages(rootDir, argValue(args, '--pages-dir')));
  }
  write(outPath, renderSectionMap(entries));
  console.log(`Wrote ${outPath} (${entries.length} entries)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
