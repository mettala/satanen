// Prints the page counts (D32) in plain text.
// Usage: npm --prefix proxy run stats [-- <days>]     (default 7, at most 90)
// Needs in the repo's .env.fixtures (or the environment):
//   CLOUDFLARE_ACCOUNT_ID       your Cloudflare account id
//   CLOUDFLARE_ANALYTICS_TOKEN  an API token with only Account > Account Analytics > Read
// The token is never printed.
import { fetchReport, formatReport, parseDays } from '../src/stats.ts';

// Secrets file is .env.fixtures (Expo does not load it). Old setups kept these two lines in
// .env; read that as a fallback, with a warning, so nothing breaks before they are moved.
const wanted = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_ANALYTICS_TOKEN'];
function load(name) {
  try {
    process.loadEnvFile(new URL(`../../${name}`, import.meta.url));
    return true;
  } catch {
    return false; // no such file: the variables may already be in the environment
  }
}
load('.env.fixtures');
if (wanted.some((k) => !process.env[k]?.trim()) && load('.env')) {
  if (wanted.every((k) => process.env[k]?.trim())) {
    console.error(
      'Warning: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_TOKEN were read from .env. Move those two lines to .env.fixtures (see .env.example); .env is copied into the app build.',
    );
  }
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN?.trim();
if (!accountId || !token) {
  console.error(
    'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ANALYTICS_TOKEN in .env.fixtures. See "Page counts" in proxy/README.md.',
  );
  process.exit(1);
}

try {
  const days = parseDays(process.argv[2]);
  console.log(formatReport(days, await fetchReport(fetch, accountId, token, days)));
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Could not read the numbers.');
  process.exit(1);
}
