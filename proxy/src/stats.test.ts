import { describe, expect, it, vi } from 'vitest';
import {
  DATASET,
  fetchReport,
  formatReport,
  parseDays,
  queries,
  runQuery,
  type Report,
} from './stats.ts';

const empty: Report = {
  perDay: [],
  topPages: [],
  countries: [],
  platforms: [],
  yleHours: [],
  yleDays: [],
  yle401: [],
  yleCentres: [],
  yleCentreHours: [],
};

describe('parseDays', () => {
  it('defaults to 7', () => {
    expect(parseDays(undefined)).toBe(7);
    expect(parseDays('')).toBe(7);
  });
  it('accepts 1 to 90', () => {
    expect(parseDays('1')).toBe(1);
    expect(parseDays('90')).toBe(90);
  });
  it.each(['0', '91', '-3', '2.5', 'abc', '7; DROP TABLE'])('rejects %s', (v) => {
    expect(() => parseDays(v)).toThrow(/whole number from 1 to 90/);
  });
});

describe('queries', () => {
  const q = queries(14);

  it('read the right dataset and period, and ask for JSON', () => {
    for (const sql of Object.values(q)) {
      expect(sql).toContain(`FROM ${DATASET}`);
      expect(sql).toContain("INTERVAL '14' DAY");
      expect(sql).toMatch(/FORMAT JSON$/);
    }
  });

  it('count with the sample interval, never a bare count()', () => {
    for (const sql of Object.values(q)) {
      expect(sql).toContain('SUM(_sample_interval)');
      expect(sql).not.toMatch(/\bcount\(\)/i);
    }
  });

  it('keep reader records and Yle records apart', () => {
    expect(q.perDay).toContain("blob1 = 'open'");
    expect(q.topPages).toContain("blob1 = 'open'");
    expect(q.yleHours).toContain("blob1 = 'yle'");
    expect(q.yle401).toContain("blob3 = 'status-401'");
  });

  it('split Yle requests by data centre (blob4), in total and by hour', () => {
    expect(q.yleCentres).toContain("blob1 = 'yle'");
    expect(q.yleCentres).toContain('blob4 AS centre');
    expect(q.yleCentres).toContain('GROUP BY centre');
    expect(q.yleCentreHours).toContain('blob4 AS centre');
    expect(q.yleCentreHours).toContain("INTERVAL '1' HOUR");
    expect(q.yleCentreHours).toContain('GROUP BY centre, hour');
  });

  it('count readers as distinct daily visitor hashes', () => {
    expect(q.perDay).toContain('count(DISTINCT blob5)');
  });

  it('top pages are limited to 20', () => {
    expect(q.topPages).toContain('LIMIT 20');
  });
});

describe('runQuery', () => {
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)));

  it('posts the SQL as the body with the token, and returns data', async () => {
    const fetchFn = ok({ data: [{ a: 1 }], rows: 1 });
    const rows = await runQuery(
      fetchFn as unknown as typeof fetch,
      'acct1',
      'tok-secret',
      'SELECT 1',
    );
    expect(rows).toEqual([{ a: 1 }]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct1/analytics_engine/sql');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('SELECT 1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-secret');
  });

  it('explains a refused token without printing it', async () => {
    const fetchFn = vi.fn(async () => new Response('denied', { status: 403 }));
    const error = await runQuery(fetchFn as unknown as typeof fetch, 'a', 'tok-secret', 'x').catch(
      (e: Error) => e,
    );
    expect((error as Error).message).toContain('403');
    expect((error as Error).message).toContain('Account Analytics');
    expect((error as Error).message).not.toContain('tok-secret');
  });

  it('fails clearly on an answer that is not JSON or has no data', async () => {
    const html = vi.fn(async () => new Response('<html>'));
    await expect(runQuery(html as unknown as typeof fetch, 'a', 't', 'x')).rejects.toThrow(
      /not JSON/,
    );
    await expect(runQuery(ok({}) as unknown as typeof fetch, 'a', 't', 'x')).rejects.toThrow(
      /no "data"/,
    );
  });
});

describe('fetchReport', () => {
  it('runs every query once', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
    const report = await fetchReport(fetchFn as unknown as typeof fetch, 'a', 't', 7);
    expect(fetchFn).toHaveBeenCalledTimes(Object.keys(queries(7)).length);
    expect(Object.keys(report).sort()).toEqual(Object.keys(empty).sort());
  });
});

describe('formatReport', () => {
  const report: Report = {
    perDay: [
      { day: '2026-10-24 00:00:00', readers: '40', opens: '120' },
      { day: '2026-10-25 00:00:00', readers: '60', opens: '280' },
    ],
    topPages: [
      { page: '105', opens: '200' },
      { page: '201', opens: '100' },
    ],
    countries: [
      { country: 'FI', opens: '380' },
      { country: 'XX', opens: '20' },
    ],
    platforms: [
      { platform: 'web', opens: '300' },
      { platform: 'app', opens: '100' },
    ],
    yleHours: [{ hour: '2026-10-25 14:00:00', requests: '270' }],
    yleDays: [{ day: '2026-10-25 00:00:00', requests: '1500' }],
    yle401: [{ requests: '0' }],
    yleCentres: [
      { centre: 'ARN', requests: '1200' },
      { centre: 'HEL', requests: '200' },
      { centre: '', requests: '100' },
    ],
    yleCentreHours: [
      { centre: 'ARN', hour: '2026-10-25 14:00:00', requests: '230' },
      { centre: 'HEL', hour: '2026-10-25 14:00:00', requests: '40' },
    ],
  };

  it('prints readers, pages, countries, platforms and the Yle limit', () => {
    const text = formatReport(7, report);
    expect(text).toContain('last 7 days');
    expect(text).toContain('2026-10-24');
    expect(text).toMatch(/40 readers\s+120 pages opened/);
    expect(text).toContain('Total pages opened: 400');
    expect(text).toMatch(/1\.\s+105\s+200\s+50 %/);
    expect(text).toMatch(/FI\s+380\s+95 %/);
    expect(text).toMatch(/web\s+300\s+75 %/);
    expect(text).toContain('270 of 300');
    expect(text).toContain('90 %');
    expect(text).toContain('<- close to the limit');
    expect(text).toContain('1500 of 7200');
    expect(text).toContain('never said "limit used up"');
  });

  it('prints Yle requests per data centre, older records as "earlier"', () => {
    const text = formatReport(7, report);
    expect(text).toContain('By Cloudflare data centre');
    expect(text).toMatch(/ARN\s+1200 requests\s+80 %/);
    expect(text).toMatch(/HEL\s+200 requests\s+13 %/);
    expect(text).toMatch(/earlier\s+100 requests\s+7 %/);
    expect(text).toMatch(/ARN\s+2026-10-25 14:00\s+230 of 300\s+77 %/);
  });

  it('leaves the data-centre part out when nothing was counted', () => {
    expect(formatReport(7, empty)).not.toContain('data centre');
  });

  it('calls out Yle refusing us', () => {
    const text = formatReport(7, { ...report, yle401: [{ requests: '3' }] });
    expect(text).toContain('3 times');
    expect(text).toContain('old copies');
  });

  it('does not warn when well below the limit', () => {
    const text = formatReport(1, {
      ...report,
      yleHours: [{ hour: '2026-10-25 14:00:00', requests: '40' }],
    });
    expect(text).toContain('last 1 day ');
    expect(text).not.toContain('<- close to the limit');
  });

  it('says so when nothing was counted yet', () => {
    const text = formatReport(7, empty);
    expect(text).toContain('No pages opened in this period yet.');
    expect(text).toContain('None counted in this period.');
  });
});
