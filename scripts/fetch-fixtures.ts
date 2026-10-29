// Saves real Yle Teksti-TV API responses to fixtures/ for offline parser tests.
//
// Run: npm run fetch-fixtures   (needs YLE_APP_ID and YLE_APP_KEY in the environment;
// the npm script loads ../.env.fixtures via --env-file when present).
//
// Only some pages: npm run fetch-fixtures -- 202 205
// Saves just those pages and leaves README.md alone (add or update their rows by hand),
// so the other fixtures, which tests depend on, stay as they are.
//
// Output:
//   fixtures/pages/<n>.json   the API JSON (query strings stripped from any URL)
//   fixtures/images/<n>.png   PNG of subpage 1
//   fixtures/README.md        table of everything saved
//
// A page the API answers with 404 is saved as {"_fixture": "not-found", "status": 404, ...}.
// Content is (c) Yle and is used only for testing. Never log or write the key.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://external.api.yle.fi/v1/teletext';
const DELAY_MS = 300;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** [page number, what it is]. Descriptions are checked against the saved text. */
const PAGES: Array<[string, string]> = [
  ['100', 'Front page (Uutiset), 4 subpages'],
  ['101', 'Uutiset index'],
  ['102', 'Kotimaa index'],
  ['103', 'Domestic news article'],
  ['104', 'Domestic news article'],
  ['105', 'Domestic news article'],
  ['109', 'Domestic news article'],
  ['110', 'Domestic news article'],
  ['136', 'Foreign news article'],
  ['199', 'Main index (Paahakemisto), 4 subpages'],
  ['200', 'Urheilu index'],
  ['201', 'Urheilu news index (sports headlines)'],
  ['202', 'Sports news article, counts like "120 NHL-ottelua" inside sentences'],
  ['205', 'Sports news article'],
  ['160', 'Talous index'],
  ['190', 'English news page'],
  ['230', 'Liiga table, 2 subpages'],
  ['233', 'Ice hockey table, 3 subpages'],
  ['237', 'NHL table, 3 subpages'],
  ['242', 'Football table (Veikkausliiga), 5 subpages'],
  ['246', 'Football results, 4 subpages'],
  ['250', 'Football table, 3 subpages'],
  ['254', 'Table, 2 subpages'],
  ['260', 'Table with page links, 4 subpages'],
  ['263', 'Table, 3 subpages'],
  ['270', 'Basketball results, 3 subpages'],
  ['298', 'F1 standings, 4 subpages'],
  ['299', 'WRC standings, 2 subpages'],
  ['300', 'TV / Radio index'],
  ['301', 'TV guide YLE TV1, 3 subpages'],
  ['302', 'TV guide YLE TV2, 3 subpages'],
  ['310', 'TV guide, 3 subpages'],
  ['330', 'TV index'],
  ['400', 'Saa ja liikenne index'],
  ['401', 'Weather, 2 subpages'],
  ['402', 'Weather, 3 subpages'],
  ['405', 'Five-day weather forecast (plain text article)'],
  ['406', 'Weather table (observations)'],
  ['407', 'Weather table (forecast)'],
  ['410', 'Traffic index, graphics-heavy title, 2 subpages'],
  ['420', 'Graphics-heavy index'],
  ['425', 'Airport board Tampere-Pirkkala, departures and arrivals, 6 subpages'],
  [
    '426',
    'Airport board Helsinki-Vantaa departures, 4 subpages (flight numbers and trailing numbers marked as links)',
  ],
  ['427', 'Airport board Helsinki-Vantaa arrivals, 4 subpages'],
  ['460', 'Ravit index'],
  ['470', 'Veikkaus index'],
  ['500', 'Alueuutiset index'],
  ['575', 'Teksti-TV info index'],
  ['700', 'Svenska index (pa svenska)'],
  ['714', 'Svenska page'],
  ['725', 'Swedish multi-subpage article, 3 subpages'],
  ['799', 'Svenska section'],
  ['890', 'Kalenteri index'],
  ['130', 'Foreign news index'],
  ['131', 'Foreign news article'],
  ['132', 'Foreign news article'],
  ['161', 'Economy article'],
  ['162', 'Economy article'],
  ['163', 'Economy article'],
  ['403', 'Weather text, 5 subpages'],
  ['404', 'Weather text'],
  ['408', 'Weather table, 3 subpages'],
  ['417', 'Road conditions, 44 subpages (stress case)'],
  ['418', 'Map-heavy article (Finland map graphic beside text), 2 subpages'],
  ['419', 'Graphic + text page'],
  ['112', 'Valid-looking page that returned 404 at capture time (no hazard notices)'],
  ['174', 'World stock market quotes (monospace rows, numbers split over lines)'],
  ['175', 'Linked from indexes'],
  [
    '176',
    'Helsinki stock exchange, OMXH Large Cap, 5 subpages (title and column labels on one row, two-row records)',
  ],
  [
    '184',
    'Equity fund prices O-Z, 16 subpages (stamp row, concealed "sn" cells, two column-header rows)',
  ],
  ['187', 'Alternative and real-estate funds, 8 subpages (title wrapped into a column-header row)'],
  ['189', 'Electricity spot price (Pörssisähkö), 4 subpages, "Keskihinnat s.188" and ">>" hints'],
  [
    '196',
    'Alphabetical index (Aakkosellinen hakemisto), 3 subpages, "Svenska sidor index på s." bar',
  ],
  ['197', 'Alphabetical index M-S, 3 subpages, notes wrapped into the next row'],
  ['198', 'Alphabetical index T-Y, 4 subpages, a page list continued on the next row'],
  ['891', 'Calendar page, "Ajatus päivälle s." reference'],
  ['999', 'Non-existent page, 404 with XML error body'],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Remove query strings / key material from every string in the JSON. */
function scrub(value: unknown): unknown {
  if (typeof value === 'string') {
    return /^https?:\/\//.test(value) ? value.split('?')[0] : value;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

function pageTitle(json: any): string {
  const sub = asArray<any>(json?.teletext?.page?.subpage)[0];
  const text = asArray<any>(sub?.content).find((c) => c.type === 'text');
  const lines = asArray<any>(text?.line)
    .map((l) => (l.Text ?? '').trim())
    .filter(Boolean);
  // Line 2 is the "Teksti-TV" header; the first content line follows the nav row.
  return (lines[2] ?? lines[1] ?? lines[0] ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/');
}

async function main() {
  const { YLE_APP_ID, YLE_APP_KEY } = process.env;
  if (!YLE_APP_ID || !YLE_APP_KEY) {
    console.error('Set YLE_APP_ID and YLE_APP_KEY (put them in .env.fixtures, see .env.example).');
    process.exit(1);
  }
  const auth = new URLSearchParams({ app_id: YLE_APP_ID, app_key: YLE_APP_KEY });

  await mkdir(join(ROOT, 'pages'), { recursive: true });
  await mkdir(join(ROOT, 'images'), { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const rows: string[] = [];

  const only = process.argv.slice(2);
  const unknown = only.filter((n) => !PAGES.some(([p]) => p === n));
  if (unknown.length) {
    console.error(`Not in the PAGES list: ${unknown.join(', ')}`);
    process.exit(1);
  }
  const pages = only.length ? PAGES.filter(([n]) => only.includes(n)) : PAGES;

  for (const [n, label] of pages) {
    const res = await fetch(`${BASE}/pages/${n}.json?${auth}`);
    const body = await res.text();
    let json: any;
    let subpages = '-';
    let title = '';
    let saved: unknown;
    if (res.ok) {
      json = JSON.parse(body);
      saved = scrub(json);
      subpages = String(json?.teletext?.page?.subpagecount ?? '?');
      title = pageTitle(json);
    } else {
      saved = {
        _fixture: 'not-found',
        status: res.status,
        contentType: res.headers.get('content-type'),
        body: body.slice(0, 500),
      };
      title = `HTTP ${res.status}`;
    }
    await writeFile(join(ROOT, 'pages', `${n}.json`), JSON.stringify(saved, null, 1) + '\n');
    console.log(`pages/${n} ${res.status}`);
    await sleep(DELAY_MS);

    let image = 'no';
    if (res.ok) {
      const img = await fetch(`${BASE}/images/${n}/1.png?${auth}`);
      if (img.ok) {
        await writeFile(join(ROOT, 'images', `${n}.png`), Buffer.from(await img.arrayBuffer()));
        image = 'yes';
      }
      console.log(`images/${n} ${img.status}`);
      await sleep(DELAY_MS);
    }
    rows.push(`| ${n} | ${label} | ${title} | ${subpages} | ${image} | ${date} |`);
  }

  if (only.length) {
    console.log('Partial run: README.md not rewritten. Rows for the saved pages:');
    for (const row of rows) console.log(row);
    return;
  }

  const readme = [
    '# Fixtures',
    '',
    'Real responses from the Yle Teksti-TV API, saved by `npm run fetch-fixtures` for offline parser tests.',
    'Content is (c) Yle and is used only for testing; it is not part of the app. No API keys or',
    'query strings are stored (`fixtures/no-secrets.test.ts` checks this).',
    '',
    '- `pages/<n>.json`: API response for page `<n>`. A 404 is stored as `{"_fixture": "not-found", "status": 404, ...}`.',
    '- `images/<n>.png`: PNG of subpage 1.',
    '',
    '| Page | What it is | First text line (auto) | Subpages | PNG | Captured |',
    '| ---- | ---------- | ---------------------- | -------- | --- | -------- |',
    ...rows,
    '',
    '## Notes on the API',
    '',
    '- A missing page returns 404 with an XML body (`NoSuchKey`, served by S3/CloudFront), not JSON. Pages that normally exist can 404 temporarily (112 did).',
    '- Success responses are JSON; `subpage` can be an object or array and numbers are strings (see docs/YLE-API.md).',
    '- 417 has 44 subpages and is about 490 KB, a good stress test.',
    '- Rate limiting: none seen. About 130 sequential requests with a 300 ms delay all succeeded and no rate-limit or retry headers were returned.',
    '- Subpage counts and content change through the day; this is a snapshot.',
    '',
  ].join('\n');
  await writeFile(join(ROOT, 'README.md'), readme);
}

main().catch((e) => {
  // Never print request URLs: they carry the key.
  console.error(e instanceof Error ? e.message : 'failed');
  process.exit(1);
});
