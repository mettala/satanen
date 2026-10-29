// Reads the page counts (D32) back from Cloudflare and turns them into a
// plain-text report for the owner. Used by `scripts/stats.mjs`. Pure apart from
// `runQuery`, which takes a fetch function so tests can fake it.
//
// Record layout is at the top of `analytics.ts`:
//   open: blob1='open', blob2=page, blob3=country, blob4=platform, blob5=daily visitor
//   yle:  blob1='yle',  blob2='p<page>'|'i<page>', blob3=outcome, blob4=data centre
//         (blob4 is empty on records from before 25.10.2026)
// Every sum uses `_sample_interval` because Cloudflare may sample busy indexes.
// (`count(DISTINCT blob5)` for readers can't be corrected for sampling, so it
// comes out too low if Cloudflare ever samples; fine at this size.)

export const DATASET = 'satanen_analytics';
/** Yle's documented limits for the whole key. */
export const YLE_LIMIT_PER_HOUR = 300;
export const YLE_LIMIT_PER_DAY = 7200;

export type Row = Record<string, string | number>;

export interface Report {
  perDay: Row[];
  topPages: Row[];
  countries: Row[];
  platforms: Row[];
  yleHours: Row[];
  yleDays: Row[];
  yle401: Row[];
  yleCentres: Row[];
  yleCentreHours: Row[];
}

export function parseDays(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 7;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 90) {
    throw new Error('Days must be a whole number from 1 to 90 (Cloudflare keeps about 3 months).');
  }
  return n;
}

/** The SQL for each part of the report. `days` is checked by `parseDays`. */
export function queries(days: number): Record<keyof Report, string> {
  const since = `timestamp > now() - INTERVAL '${days}' DAY`;
  const opens = `FROM ${DATASET} WHERE blob1 = 'open' AND ${since}`;
  const yle = `FROM ${DATASET} WHERE blob1 = 'yle' AND ${since}`;
  return {
    perDay: `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, count(DISTINCT blob5) AS readers, SUM(_sample_interval) AS opens ${opens} GROUP BY day ORDER BY day FORMAT JSON`,
    topPages: `SELECT blob2 AS page, SUM(_sample_interval) AS opens ${opens} GROUP BY page ORDER BY opens DESC LIMIT 20 FORMAT JSON`,
    countries: `SELECT blob3 AS country, SUM(_sample_interval) AS opens ${opens} GROUP BY country ORDER BY opens DESC LIMIT 10 FORMAT JSON`,
    platforms: `SELECT blob4 AS platform, SUM(_sample_interval) AS opens ${opens} GROUP BY platform ORDER BY opens DESC FORMAT JSON`,
    yleHours: `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, SUM(_sample_interval) AS requests ${yle} GROUP BY hour ORDER BY requests DESC LIMIT 5 FORMAT JSON`,
    yleDays: `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, SUM(_sample_interval) AS requests ${yle} GROUP BY day ORDER BY requests DESC LIMIT 3 FORMAT JSON`,
    yle401: `SELECT SUM(_sample_interval) AS requests ${yle} AND blob3 = 'status-401' FORMAT JSON`,
    yleCentres: `SELECT blob4 AS centre, SUM(_sample_interval) AS requests ${yle} GROUP BY centre ORDER BY requests DESC LIMIT 10 FORMAT JSON`,
    yleCentreHours: `SELECT blob4 AS centre, toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, SUM(_sample_interval) AS requests ${yle} GROUP BY centre, hour ORDER BY requests DESC LIMIT 5 FORMAT JSON`,
  };
}

/** Runs one query. The error message never contains the token. */
export async function runQuery(
  fetchFn: typeof fetch,
  accountId: string,
  token: string,
  sql: string,
): Promise<Row[]> {
  const res = await fetchFn(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: sql },
  );
  const text = await res.text();
  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403
        ? ' (check the token: it needs Account > Account Analytics > Read)'
        : '';
    throw new Error(`Cloudflare answered ${res.status}${hint}: ${text.slice(0, 300)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Cloudflare's answer was not JSON: ${text.slice(0, 200)}`);
  }
  const data = (parsed as { data?: unknown }).data;
  if (!Array.isArray(data)) throw new Error('Cloudflare\'s answer had no "data" list.');
  return data as Row[];
}

export async function fetchReport(
  fetchFn: typeof fetch,
  accountId: string,
  token: string,
  days: number,
): Promise<Report> {
  const q = queries(days);
  const entries = await Promise.all(
    (Object.keys(q) as (keyof Report)[]).map(
      async (k) => [k, await runQuery(fetchFn, accountId, token, q[k])] as const,
    ),
  );
  return Object.fromEntries(entries) as unknown as Report;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const pct = (n: number, of: number) => `${Math.round((n / of) * 100)} %`;
/** "2026-10-24 14:00:00" or ISO → "2026-10-24" / "2026-10-24 14:00" (UTC). */
const dayOf = (v: unknown) => String(v).slice(0, 10);
const hourOf = (v: unknown) => String(v).replace('T', ' ').slice(0, 16);
/** Records from before the data centre was counted have it empty. */
const centreOf = (v: unknown) => (v === undefined || v === '' ? 'earlier' : String(v));

export function formatReport(days: number, r: Report): string {
  const out: string[] = [];
  const line = (s = '') => out.push(s);
  const totalOpens = r.perDay.reduce((sum, d) => sum + num(d.opens), 0);

  line(
    `Satanen numbers, last ${days} day${days === 1 ? '' : 's'} (counted by the proxy; times in UTC)`,
  );
  line();

  if (totalOpens === 0) {
    line('No pages opened in this period yet.');
  } else {
    line('Readers per day');
    line(
      '  The first and last day are partial (the period counts back from now), so they can look low.',
    );
    line(
      '  A "reader" is a daily visitor hash. People behind one mobile-network address can count as one,',
    );
    line(
      '  one person on wifi and mobile as two, and nobody can be followed from one day to the next.',
    );
    for (const d of r.perDay) {
      line(
        `  ${dayOf(d.day)}   ${String(num(d.readers)).padStart(6)} readers   ${String(num(d.opens)).padStart(7)} pages opened`,
      );
    }
    line(`  Total pages opened: ${totalOpens}`);
    line();
    line('Most opened pages');
    r.topPages.forEach((p, i) => {
      line(
        `  ${String(i + 1).padStart(2)}.  ${String(p.page).padEnd(5)} ${String(num(p.opens)).padStart(7)}   ${pct(num(p.opens), totalOpens)}`,
      );
    });
    line();
    line('Where from (country)');
    for (const c of r.countries) {
      line(
        `  ${String(c.country).padEnd(3)} ${String(num(c.opens)).padStart(7)}   ${pct(num(c.opens), totalOpens)}`,
      );
    }
    line();
    line('Web or app');
    for (const p of r.platforms) {
      line(
        `  ${String(p.platform).padEnd(4)} ${String(num(p.opens)).padStart(7)}   ${pct(num(p.opens), totalOpens)}`,
      );
    }
  }

  line();
  line(`Requests to Yle (their limit: ${YLE_LIMIT_PER_HOUR} an hour, ${YLE_LIMIT_PER_DAY} a day)`);
  if (r.yleHours.length === 0) {
    line('  None counted in this period.');
  } else {
    line('  Busiest hours');
    for (const h of r.yleHours) {
      const n = num(h.requests);
      line(
        `    ${hourOf(h.hour)}   ${String(n).padStart(4)} of ${YLE_LIMIT_PER_HOUR}   ${pct(n, YLE_LIMIT_PER_HOUR)}${n >= YLE_LIMIT_PER_HOUR * 0.8 ? '   <- close to the limit' : ''}`,
      );
    }
    line('  Busiest days');
    for (const d of r.yleDays) {
      const n = num(d.requests);
      line(
        `    ${dayOf(d.day)}   ${String(n).padStart(5)} of ${YLE_LIMIT_PER_DAY}   ${pct(n, YLE_LIMIT_PER_DAY)}${n >= YLE_LIMIT_PER_DAY * 0.8 ? '   <- close to the limit' : ''}`,
      );
    }
  }
  if (r.yleCentres.length > 0) {
    line(
      '  By Cloudflare data centre (each one keeps its own copy of a page, so each asks Yle itself)',
    );
    line(
      '    "earlier" is requests counted before 25.10.2026, when the data centre was not yet recorded.',
    );
    const total = r.yleCentres.reduce((sum, c) => sum + num(c.requests), 0);
    for (const c of r.yleCentres) {
      const n = num(c.requests);
      line(
        `    ${centreOf(c.centre).padEnd(7)} ${String(n).padStart(6)} requests   ${pct(n, total)}`,
      );
    }
    line('  Busiest hours by data centre');
    for (const h of r.yleCentreHours) {
      const n = num(h.requests);
      line(
        `    ${centreOf(h.centre).padEnd(7)} ${hourOf(h.hour)}   ${String(n).padStart(4)} of ${YLE_LIMIT_PER_HOUR}   ${pct(n, YLE_LIMIT_PER_HOUR)}`,
      );
    }
  }
  const refused = num(r.yle401[0]?.requests);
  line(
    refused > 0
      ? `  Yle said "limit used up" (401) ${refused} time${refused === 1 ? '' : 's'}: readers got old copies. Ask Yle for a higher limit or lengthen the cache.`
      : '  Yle never said "limit used up" (401) in this period.',
  );
  line();
  return out.join('\n');
}
