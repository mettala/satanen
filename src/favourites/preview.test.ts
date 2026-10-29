import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { headlines } from '../front/frontPage';
import { toReaderBlocks } from '../parser/blocks';
import type { Page } from '../parser/model';
import { normalize } from '../parser/normalize';
import { favouritePreview, firstSentence } from './preview';

const pagesDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../fixtures/pages');

function raw(n: number): unknown {
  return JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8'));
}
function load(n: number): Page {
  const result = normalize(raw(n));
  if (!result.ok) throw new Error(`fixture ${n} does not normalise`);
  return result.page;
}

describe('firstSentence', () => {
  it('stops at the first full stop followed by a capital', () => {
    expect(firstSentence('Yksi kuoli. Neljä vietiin sairaalaan.')).toBe('Yksi kuoli.');
  });
  it('keeps the whole text when there is no sentence end', () => {
    expect(firstSentence('Ei loppua')).toBe('Ei loppua');
  });
  it('ends at ? and !', () => {
    expect(firstSentence('Onko näin? Kyllä.')).toBe('Onko näin?');
  });
  it('does not end after a number (dates, times)', () => {
    expect(firstSentence('Kokous on 21. Lokakuuta pidetty.')).toBe(
      'Kokous on 21. Lokakuuta pidetty.',
    );
  });
  it('does not end before a lower-case word (abbreviations)', () => {
    expect(firstSentence('Hinta on n. viisi euroa. Toinen.')).toBe('Hinta on n. viisi euroa.');
  });
  it('keeps a closing quote with the sentence', () => {
    expect(firstSentence('Hän sanoi "kyllä." Sitten lähti.')).toBe('Hän sanoi "kyllä."');
  });
  it('handles empty text', () => {
    expect(firstSentence('')).toBe('');
  });
});

describe('favouritePreview on fixtures', () => {
  it('article 105: title + first sentence', () => {
    expect(favouritePreview(load(105))).toEqual({
      label: 'Kotimaa',
      time: '6:08',
      headline: 'Yksi kuoli Jyväskylän palossa',
      sub: 'Jyväskylässä Hämeenkadulla tapahtuneessa kerrostalopalossa on kuollut yksi mies.',
    });
  });

  it('index 102: first headline + count of the others from the page', () => {
    const page = load(102);
    const all = headlines(toReaderBlocks(page));
    const p = favouritePreview(page);
    expect(p.label).toBe('Kotimaa');
    expect(p.time).toBe('0:13');
    expect(p.headline).toBe('Etelässä odotetaan lämpenemistä');
    expect(p.sub).toBe(`+ ${all.length - 1} muuta uutista`);
    expect(all.length).toBeGreaterThan(2);
  });

  it('index 160: range entries are not counted as headlines', () => {
    const page = load(160);
    const all = headlines(toReaderBlocks(page));
    const p = favouritePreview(page);
    expect(p.label).toBe('Talous');
    expect(p.headline).toBe('Netflixin osake laskussa');
    expect(p.sub).toBe(`+ ${all.length - 1} muuta uutista`);
  });

  it('table page 230: section label, header name as headline, not the footnote', () => {
    // The only paragraph on 230 is the footnote `Runkosarjassa pelataan 44 kierrosta.`
    expect(favouritePreview(load(230))).toEqual({
      label: 'Urheilu',
      time: '21:15',
      headline: 'JÄÄKIEKKO U20 SM-SARJA',
    });
  });

  it('table page 235: header name, never a stray body line like `(Koivunen)`', () => {
    expect(favouritePreview(load(235))).toEqual({
      label: 'Urheilu',
      time: '8:19',
      headline: 'NHL-JÄÄKIEKKO',
    });
  });

  it('table page 250 (no title rows, no text): header name instead of nothing', () => {
    expect(favouritePreview(load(250))).toEqual({
      label: 'Urheilu',
      time: '9:19',
      headline: 'JALKAPALLO T18 SM',
    });
  });

  it('table page 406: a coloured bar above the table does not hide the header name', () => {
    expect(favouritePreview(load(406)).headline).toBe('Ilmatieteen laitos: sää tänään');
  });

  it('table page with no usable header row: section name as headline', () => {
    const page = structuredClone(load(250));
    const header = page.subpages[0].lines.find((l) => l.number === 1)!;
    for (const r of header.runs) {
      r.text = ' '.repeat(r.length);
      r.hasText = false;
    }
    header.text = header.runs.map((r) => r.text).join('');
    expect(favouritePreview(page)).toEqual({
      label: 'Urheilu',
      time: '9:19',
      headline: 'Urheilu',
    });
  });

  it('every table-page fixture gets a non-empty label and headline', () => {
    for (const n of [230, 233, 235, 237, 242, 250, 254, 260, 263, 298, 299, 406, 407, 408]) {
      const p = favouritePreview(load(n));
      expect(p.label, `${n}`).not.toBe('');
      expect(p.headline, `${n}`).not.toBe('');
    }
  });

  it('weather page 403: title row as headline', () => {
    const p = favouritePreview(load(403));
    expect(p.label).toBe('Sää ja liikenne');
    expect(p.time).toBe('21:26');
    expect(p.headline).toBe('Ilmatieteen laitos 21.10.');
    expect(p.sub).toBeUndefined();
  });

  it('not found 999: no page, no throw, label from the number', () => {
    expect(normalize(raw(999)).ok).toBe(false);
    expect(favouritePreview(undefined, 999)).toEqual({ label: 'Muut', headline: '' });
    expect(() => favouritePreview(undefined)).not.toThrow();
  });
});

describe('favouritePreview edge cases', () => {
  it('uses the page name as label when Yle gives one', () => {
    const page = { ...structuredClone(load(105)), name: 'Palo' };
    expect(favouritePreview(page).label).toBe('Palo');
  });

  it('leaves the time out when the page has none', () => {
    const page = { ...structuredClone(load(105)), time: undefined };
    expect(favouritePreview(page).time).toBeUndefined();
  });

  it('index with a single headline has no count line', () => {
    const page = structuredClone(load(102));
    const keep = headlines(toReaderBlocks(page))[0].page;
    for (const sp of page.subpages) {
      for (const line of sp.lines) {
        const linked = line.runs.some((r) => r.link?.kind === 'page');
        const isKept = line.runs.some((r) => r.link?.kind === 'page' && r.link.page === keep);
        if (!linked || isKept) continue;
        for (const r of line.runs) {
          r.text = ' '.repeat(r.length);
          r.hasText = false;
          delete r.link;
        }
        line.text = line.runs.map((r) => r.text).join('');
      }
    }
    const p = favouritePreview(page);
    expect(p.headline).toBe('Etelässä odotetaan lämpenemistä');
    expect(p.sub).toBeUndefined();
  });

  it('an empty page gives an empty headline', () => {
    const page = structuredClone(load(105));
    for (const sp of page.subpages) {
      for (const line of sp.lines) {
        for (const r of line.runs) {
          r.text = ' '.repeat(r.length);
          r.hasText = false;
          r.doubleHeight = false;
        }
        line.text = line.runs.map((r) => r.text).join('');
      }
    }
    expect(favouritePreview(page).headline).toBe('');
  });

  it('never changes the text: headline is the heading as in the reader blocks', () => {
    const page = load(105);
    const heading = toReaderBlocks(page).find((b) => b.kind === 'heading');
    expect(favouritePreview(page).headline).toBe(heading && 'text' in heading ? heading.text : '');
  });
});
