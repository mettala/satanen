// Smoke test for the deployed web app (D17).
// Usage: npm run smoke:web [-- https://satanen.io]
const base = (process.argv[2] ?? 'https://satanen.io').replace(/\/$/, '');
let failed = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failed += 1;
}

const get = (path) => fetch(base + path, { redirect: 'manual' });
const noCache = (res) => /no-cache|no-store/.test(res.headers.get('cache-control') ?? '');

const home = await get('/');
const homeHtml = await home.text();
check(
  '/ returns the app',
  home.status === 200 && homeHtml.includes('id="root"'),
  `status ${home.status}`,
);
check('/ is not cached', noCache(home));

const page = await get('/105');
const pageHtml = await page.text();
check(
  '/105 returns the app',
  page.status === 200 && pageHtml === homeHtml,
  `status ${page.status}`,
);

// A reload sends the ETag it saw; the deep link must still come back with the app.
const etag = home.headers.get('etag');
if (etag) {
  const again = await fetch(`${base}/105`, {
    headers: { 'If-None-Match': etag },
    redirect: 'manual',
  });
  const body = await again.text();
  check(
    '/105 with a saved ETag is not blank',
    again.status === 200 ? body.includes('id="root"') : again.status === 304,
    `status ${again.status}, ${body.length} bytes`,
  );
}

const dev = await get('/dev/states');
check('/dev/states serves the app (it shows not-found itself)', dev.status === 200);

const manifest = await get('/manifest.webmanifest');
let manifestJson = null;
try {
  manifestJson = await manifest.json();
} catch {
  /* reported below */
}
check(
  'manifest is valid',
  manifest.status === 200 && manifestJson?.name === 'Satanen',
  `status ${manifest.status}`,
);

const sw = await get('/sw.js');
const swText = await sw.text();
check(
  'sw.js is JavaScript',
  sw.status === 200 &&
    /javascript/.test(sw.headers.get('content-type') ?? '') &&
    swText.includes('satanen-shell-'),
);
check('sw.js is not cached', noCache(sw));

const scriptPath = homeHtml.match(/\/_expo\/static\/[^"']+\.js/)?.[0];
check('index.html links a hashed script', Boolean(scriptPath));
if (scriptPath) {
  const js = await get(scriptPath);
  await js.arrayBuffer();
  const cc = js.headers.get('cache-control') ?? '';
  check(
    'hashed script is cached for a year',
    js.status === 200 && /max-age=31536000/.test(cc) && /immutable/.test(cc),
    cc,
  );
}

// The live scripts must not call a server on the visitor's own machine (Chrome asks for
// "Local Network Access" permission when they do).
const scriptPaths = [...homeHtml.matchAll(/\/_expo\/static\/[^"']+\.js/g)].map((m) => m[0]);
for (const path of scriptPaths) {
  const text = await (await get(path)).text();
  check(
    `${path.split('/').pop()} has no local address`,
    !/https?:\/\/(localhost|127\.0\.0\.1)/.test(text),
  );
}

const versionRes = await get('/version.json');
let versionJson = null;
try {
  versionJson = await versionRes.json();
} catch {
  /* reported below */
}
check(
  '/version.json has a commit sha',
  versionRes.status === 200 && /^[0-9a-f]{40}$/.test(versionJson?.sha ?? ''),
  `status ${versionRes.status}`,
);
check(
  '/version.json is not stored by caches',
  /no-store/.test(versionRes.headers.get('cache-control') ?? ''),
);
if (versionJson?.sha)
  console.log(`     live commit ${versionJson.sha}, built ${versionJson.builtAt}`);

for (const path of ['/_expo/static/js/web/nope.js', '/assets/nope.png']) {
  const res = await get(path);
  const type = res.headers.get('content-type') ?? '';
  check(
    `${path} answers 404, not the app`,
    res.status === 404 && !type.includes('text/html'),
    `status ${res.status} ${type}`,
  );
}

// Search engines may list only the front page (D52, D53).
const robotsTag = (res) => res.headers.get('x-robots-tag') ?? '';
check('front page can be indexed (no noindex header)', !robotsTag(home).includes('noindex'));
check('numbered pages are noindex', robotsTag(page).includes('noindex'), robotsTag(page));
const robots = await get('/robots.txt');
const robotsText = await robots.text();
check(
  'robots.txt is plain text, allows crawling and names the sitemap',
  robots.status === 200 &&
    (robots.headers.get('content-type') ?? '').includes('text/plain') &&
    !robotsTag(robots).includes('noindex') &&
    /^Allow: \/$/m.test(robotsText) &&
    robotsText.includes('Sitemap: https://satanen.io/sitemap.xml'),
  `status ${robots.status} ${robots.headers.get('content-type')}`,
);
const sitemap = await get('/sitemap.xml');
check(
  'sitemap.xml is XML and lists the front page',
  sitemap.status === 200 &&
    (sitemap.headers.get('content-type') ?? '').includes('xml') &&
    (await sitemap.text()).includes('<loc>https://satanen.io/</loc>'),
  `status ${sitemap.status} ${sitemap.headers.get('content-type')}`,
);
check(
  'front page has the share-card tags (title, description, image)',
  ['og:title', 'og:description', 'og:image'].every((p) => homeHtml.includes(`property="${p}"`)) &&
    homeHtml.includes('rel="canonical"'),
);
const ogImage = await get('/og-image.png');
check(
  '/og-image.png is a PNG',
  ogImage.status === 200 && (ogImage.headers.get('content-type') ?? '').includes('image/png'),
  `status ${ogImage.status} ${ogImage.headers.get('content-type')}`,
);

// Security headers (PUB.12, D44) on the front page and on a fallback path the worker answers.
for (const [label, res] of [
  ['/', home],
  ['/105', page],
]) {
  const csp = res.headers.get('content-security-policy') ?? '';
  const hsts = res.headers.get('strict-transport-security') ?? '';
  check(
    `${label} has a CSP with the needed directives`,
    [
      "default-src 'none'",
      "script-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "worker-src 'self'",
      'connect-src',
    ].every((d) => csp.includes(d)),
    csp,
  );
  check(
    `${label} CSP has no unsafe-inline or unsafe-eval for scripts`,
    !/script-src[^;]*'unsafe-/.test(csp),
    csp,
  );
  check(`${label} has HSTS`, /max-age=\d{7,}/.test(hsts), hsts);
  check(`${label} has nosniff`, res.headers.get('x-content-type-options') === 'nosniff');
}
// The policy blocks inline scripts, so the page must not have any.
check('index.html has no inline script', !/<script(?![^>]*\ssrc=)[^>]*>/i.test(homeHtml));

console.log(
  failed ? `\n${failed} check(s) failed against ${base}` : `\nAll checks passed against ${base}`,
);
process.exit(failed ? 1 : 0);
