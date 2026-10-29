// Release guard (PUB.9): refuses to continue unless this is a clean, pushed, CI-green main.
// There is no bypass flag and no environment variable that skips it (D42): an emergency
// deploy means running wrangler by hand and logging it. See docs/maintainer/DEPLOY.md.
// scripts/deploy.mjs calls checkReleaseOrExit() itself, so the guard also runs when
// deploy.mjs is started directly, and again after the web build.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRelease } from './release-lib.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function run(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function checkReleaseOrExit(runner = run) {
  const { ok, failures, head } = checkRelease(runner);
  if (!ok) {
    console.error('Release stopped. Reasons:');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('Nothing was deployed. See docs/maintainer/DEPLOY.md.');
    process.exit(1);
  }
  console.log(
    `Release guard passed for ${head.slice(0, 7)}: clean main, equals origin/main, CI green.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkReleaseOrExit();
}
