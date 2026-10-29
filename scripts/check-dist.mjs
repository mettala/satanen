// Guards for the production web build (run by build:web and deploy:web).
// 1. It must not point at a local server: a stray EXPO_PUBLIC_PROXY_URL=http://localhost:8787
//    from a local env file once ended up in the live site.
// 2. It must not contain the developer preview or saved Yle fixtures (PUB.16).
//
// Secrets guard (PUB.18). Expo replaces `process.env.EXPO_PUBLIC_X` with its VALUE at build
// time, so the name never appears in dist/ and a name scan of dist/ proves nothing. Instead:
//  a. checkSources: no file under app/ or src/ names an EXPO_PUBLIC_ variable other than
//     EXPO_PUBLIC_PROXY_URL (so no secret can be wired into the app by name);
//  b. checkEnvNames: neither the build environment nor the root .env defines another
//     EXPO_PUBLIC_ variable (Expo would inline it for any code that reads it);
//  c. checkSecretsInDist: no value from .env.fixtures appears in dist/.
// This does not catch a secret pasted into source code as a literal, or one stored under a
// name that does not start with EXPO_PUBLIC_ and read some other way. Only names are
// ever reported, never values.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

/** Returns a list of problems found in a built `dist` folder (empty = fine). */
export function checkDist(dist) {
  const problems = [];
  const jsDir = join(dist, '_expo/static/js/web');
  const js = existsSync(jsDir) ? readdirSync(jsDir).filter((f) => f.endsWith('.js')) : [];
  if (!existsSync(dist)) problems.push(`${dist} is missing; run the web export first`);
  else if (!js.length) problems.push(`no .js files in ${jsDir}`);
  for (const f of js) {
    const text = readFileSync(join(jsDir, f), 'utf8');
    if (/https?:\/\/(localhost|127\.0\.0\.1)/.test(text)) {
      problems.push(`points at a local address: ${f}`);
    }
    if (/fixtures\/(pages|images)\/|fixtureEntries|"page":\s*100,\s*"raw"/.test(text)) {
      problems.push(`fixture reference in ${f}`);
    }
  }
  const files = existsSync(dist) ? walk(dist).map((f) => f.slice(dist.length + 1)) : [];
  for (const f of files) {
    const name = f.split('/').pop();
    if (
      /^(preview|components|states|feed)-[0-9a-f]{32}\.js$/.test(name) &&
      f.includes('static/js')
    ) {
      problems.push(`developer screen chunk in dist: ${f}`);
    }
    if (/(^|\/)fixtures?\//.test(f) || /^\d{3}-[0-9a-f]{32}\.(png|json)$/.test(name)) {
      problems.push(`Yle fixture in dist: ${f}`);
    }
  }
  const sw = join(dist, 'sw.js');
  if (existsSync(sw) && /\/dev\/|preview-[0-9a-f]{32}/.test(readFileSync(sw, 'utf8'))) {
    problems.push('service worker pre-caches developer files');
  }
  return problems;
}

const ALLOWED = 'EXPO_PUBLIC_PROXY_URL';

/** Parses KEY=VALUE lines (comments, `export`, simple quotes). */
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** Source files under the given folders that name a disallowed EXPO_PUBLIC_ variable. */
export function checkSources(roots) {
  const problems = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const f of walk(root)) {
      if (!/\.(tsx?|jsx?|mjs|cjs|json)$/.test(f)) continue;
      const names = new Set(readFileSync(f, 'utf8').match(/EXPO_PUBLIC_[A-Za-z0-9_]*/g) ?? []);
      for (const n of names) if (n !== ALLOWED) problems.push(`${f} uses ${n}`);
    }
  }
  return problems;
}

/** Disallowed EXPO_PUBLIC_ names defined in an environment and/or parsed .env (names only). */
export function checkEnvNames(env, dotenv = {}) {
  const names = new Set([...Object.keys(env), ...Object.keys(dotenv)]);
  return [...names]
    .filter((n) => n.startsWith('EXPO_PUBLIC_') && n !== ALLOWED)
    .sort()
    .map((n) => `${n} is defined in the build environment or .env; only ${ALLOWED} may be`);
}

/** Variables from the secrets file whose value (4+ characters) appears in dist/. */
export function checkSecretsInDist(dist, secrets) {
  const problems = [];
  if (!existsSync(dist)) return problems;
  const entries = Object.entries(secrets).filter(([, v]) => v.length >= 4);
  if (!entries.length) return problems;
  const hit = new Set();
  for (const f of walk(dist)) {
    const text = readFileSync(f, 'utf8');
    for (const [k, v] of entries) if (text.includes(v)) hit.add(k);
  }
  for (const k of [...hit].sort()) problems.push(`the value of ${k} (.env.fixtures) is in dist/`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const readEnv = (f) => (existsSync(f) ? parseEnvFile(readFileSync(f, 'utf8')) : {});
  const problems = [
    ...checkDist('dist'),
    ...checkSources(['app', 'src']),
    ...checkEnvNames(process.env, readEnv('.env')),
    ...checkSecretsInDist('dist', readEnv('.env.fixtures')),
  ];
  if (problems.length) {
    console.error(`check-dist failed:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('dist ok: no local addresses, no developer screens, no fixtures, no secrets');

  // The build must say which commit it is (written by scripts/write-version.mjs).
  let version = null;
  try {
    version = JSON.parse(readFileSync('dist/version.json', 'utf8'));
  } catch {
    /* reported below */
  }
  if (!/^[0-9a-f]{40}$/.test(version?.sha ?? '')) {
    console.error('dist/version.json is missing or has no 40-character sha');
    process.exit(1);
  }
  console.log(`dist/version.json ok (${version.sha.slice(0, 7)})`);
}
