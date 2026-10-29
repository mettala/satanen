// Smoke test for a deployed proxy.
// Usage: npm --prefix proxy run smoke [-- <base url>]   (default: production)
// No key needed; this only talks to our own proxy.
const base = (process.argv[2] ?? 'https://api.satanen.io').replace(/\/$/, '');
const ORIGIN = 'https://satanen.io';
let failed = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (${detail})`}`);
  if (!ok) failed++;
}

async function get(path, headers = {}) {
  const res = await fetch(base + path, { headers });
  const body = Buffer.from(await res.arrayBuffer());
  return { res, body };
}

const type = (r) => r.res.headers.get('content-type') ?? '';
const leaks = (r, includeBody = true) => {
  const text = (includeBody ? r.body.toString('latin1') : '') + JSON.stringify([...r.res.headers]);
  return /app_key|app_id/i.test(text);
};

const page = await get('/v1/pages/100.json', { Origin: ORIGIN });
check('100.json is 200', page.res.status === 200, String(page.res.status));
check('100.json is JSON', type(page).includes('json'), type(page));
let parses = true;
try {
  JSON.parse(page.body.toString('utf8'));
} catch {
  parses = false;
}
check('100.json parses', parses);
check(
  'CORS allows https://satanen.io',
  page.res.headers.get('access-control-allow-origin') === ORIGIN,
);
check('no app_key in 100.json', !leaks(page));

const again = await get('/v1/pages/100.json');
const cache = again.res.headers.get('x-satanen-cache');
check('second call is a cache HIT', cache === 'HIT', String(cache));

const missing = await get('/v1/pages/999.json');
check('999.json is 404', missing.res.status === 404, String(missing.res.status));
check('999.json is JSON', type(missing).includes('json'), type(missing));
check('no app_key in 404', !leaks(missing));

const img = await get('/v1/images/100/1.png');
check('image is 200', img.res.status === 200, String(img.res.status));
check('image is image/png', type(img).includes('image/png'), type(img));
check('no app_key in image headers', !leaks(img, false));

const foreign = await get('/v1/pages/100.json', { Origin: 'https://example.com' });
check('other origins get 403', foreign.res.status === 403, String(foreign.res.status));
check(
  'other origins get no CORS header',
  foreign.res.headers.get('access-control-allow-origin') === null,
);
check('no app_key in 403', !leaks(foreign));

console.log(
  failed ? `\n${failed} check(s) failed against ${base}` : `\nAll checks passed against ${base}`,
);
process.exit(failed ? 1 : 0);
