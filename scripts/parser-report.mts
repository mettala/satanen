/**
 * Prints a plain table of how well the parser reads every fixture in
 * fixtures/pages/, worst first. Always exits 0.
 *
 * Run with `npm run parser-report` (uses the same ts-loader hook as
 * `npm run section-map`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { analysePage, formatReport, reportRow } from '../src/parser/analyse.ts';

const pagesDir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'fixtures', 'pages');

function main(): void {
  const rows = readdirSync(pagesDir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => {
      const raw: unknown = JSON.parse(readFileSync(resolve(pagesDir, f), 'utf8'));
      return reportRow(Number.parseInt(f, 10), analysePage(raw));
    });
  console.log(formatReport(rows));
  console.log(
    `\n${rows.length} pages, ${rows.filter((r) => r.fallback).length} fall back, ` +
      `${rows.filter((r) => r.lowConfidence).length} low confidence`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
