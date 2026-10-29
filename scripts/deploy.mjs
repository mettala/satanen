// Runs `wrangler deploy` with a version message naming the commit (PUB.9).
// Usage: node scripts/deploy.mjs web|proxy   (run after scripts/assert-release.mjs)
// Arguments go to wrangler as an array, never through a shell, so a commit subject
// cannot inject commands.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deployMessage, versionProblem } from './release-lib.mjs';
import { checkReleaseOrExit, root, run } from './assert-release.mjs';

// Always check, even when this file is started directly. For the web deploy this runs after
// the build, so the tree and origin/main are checked again right before wrangler.
checkReleaseOrExit();

const target = process.argv[2];
const wrangler = join(root, 'proxy', 'node_modules', '.bin', 'wrangler');
const sha = run('git', ['rev-parse', 'HEAD']).trim();
const subject = run('git', ['log', '-1', '--format=%s']).trim();

let args;
let cwd;
if (target === 'web') {
  // The build must be of this exact commit.
  const built = JSON.parse(readFileSync(join(root, 'dist', 'version.json'), 'utf8'));
  if (versionProblem(built) || built.sha !== sha) {
    console.error('dist/version.json does not match HEAD; rebuild with npm run deploy:web');
    process.exit(1);
  }
  cwd = root;
  args = ['deploy', '-c', 'site/wrangler.toml'];
} else if (target === 'proxy') {
  cwd = join(root, 'proxy');
  args = ['deploy'];
} else {
  console.error('Usage: node scripts/deploy.mjs web|proxy');
  process.exit(1);
}

args.push('--message', deployMessage(sha, subject));
const result = spawnSync(wrangler, args, { cwd, stdio: 'inherit' });
if (result.error) console.error(`Could not start wrangler: ${result.error.message}`);
process.exit(result.status ?? 1);
