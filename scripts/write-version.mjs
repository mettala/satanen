// Writes dist/version.json ({ sha, builtAt }) so the live site says which commit it came from.
// Generated at build time, never committed.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFullSha, versionJson } from './release-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!isFullSha(sha)) throw new Error(`git gave an unexpected sha: ${sha}`);
writeFileSync(join(root, 'dist', 'version.json'), `${JSON.stringify(versionJson(sha))}\n`);
console.log(`dist/version.json written for ${sha.slice(0, 7)}`);
