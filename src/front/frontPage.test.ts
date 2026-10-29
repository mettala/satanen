import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { classify } from '../parser/classify';
import { toReaderBlocks } from '../parser/blocks';
import type { Line, Page } from '../parser/model';
import { sectionOf } from '../sections/sectionOf';
import { normalize } from '../parser/normalize';
import { frontPage, headlines, ingress, isProse, NAV_PAGES } from './frontPage';

const here = fileURLToPath(new URL('.', import.meta.url));
const pagesDir = resolve(here, '../../fixtures/pages');

function load(n: number): Page {
  const result = normalize(JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8')));
  if (!result.ok) throw new Error(`fixture ${n} does not normalise`);
  return result.page;
}

// ------------------------------------------------- hand-made page edits
// Edge cases are built from the real page 100 so the rows look like Yle's.

function editRows(page: Page, rows: number[], edit: (line: Line) => void): Page {
  const copy = structuredClone(page);
  for (const sp of copy.subpages) {
    for (const line of sp.lines) {
      if (!rows.includes(line.number)) continue;
      edit(line);
      line.text = line.runs.map((r) => r.text).join('');
    }
  }
  return copy;
}

/** Blank the rows on every subpage (no text, no links). */
function blank(page: Page, rows: number[]): Page {
  return editRows(page, rows, (line) => {
    line.runs = [
      {
        text: ' '.repeat(40),
        hasText: false,
        column: 0,
        length: 40,
        fg: 'white',
        bg: 'black',
        graphics: false,
        doubleHeight: false,
      },
    ];
  });
}

/** Point the row's page link (and its on-screen number) somewhere else. */
function retarget(page: Page, row: number, to: number): Page {
  return editRows(page, [row], (line) => {
    for (const run of line.runs) {
      if (run.link?.kind !== 'page') continue;
      run.link = { kind: 'page', page: to };
      run.text = run.text.replace(/\d{3}/, String(to));
    }
  });
}

/** Page 100's headline rows (on every subpage). */
const ROW = { putin: 6, palo: 9, verkko: 11, katkos: 13, jokinen: 15 };

// ------------------------------------------------------------- page 100

describe('frontPage on page 100', () => {
  const page = load(100);
  const model = frontPage(page);

  it('takes the first headline as the lead', () => {
    expect(model.lead).toEqual({
      page: 136,
      text: 'Putin: Olen valmis neuvotteluihin',
      section: 'world',
    });
  });

  it('groups the other headlines Kotimaa first, then Urheilu', () => {
    expect(model.groups).toEqual([
      {
        section: 'news',
        headlines: [
          { page: 110, text: 'Epäily: Jyväskylän palo tahallinen', section: 'news' },
          { page: 109, text: 'Verkkopalveluja ajetaan alas', section: 'news' },
          { page: 111, text: 'TEKSTI-TV:N NETTIVERSION KATKOS OHI', section: 'news' },
        ],
      },
      {
        section: 'sport',
        headlines: [{ page: 205, text: 'Olli Jokinen sai lähteä HIFK:sta', section: 'sport' }],
      },
    ]);
  });

  it('keeps each headline text exactly as on the page', () => {
    const rows = page.subpages[0].lines.map((l) => l.text);
    const all = [model.lead!, ...model.groups.flatMap((g) => g.headlines)];
    for (const h of all) {
      expect(rows.some((row) => row.includes(`${h.page} ${h.text}`))).toBe(true);
    }
  });

  it('leaves out the masthead and the coloured section bars of every subpage', () => {
    const shown = [model.lead!, ...model.groups.flatMap((g) => g.headlines)].map((h) => h.page);
    // 199 masthead; 101, 160, 201, 400 … bottom bars; 406, 811, 841, 895 promo rows.
    for (const p of [199, 101, 160, 190, 201, 350, 400, 470, 799, 890, 406, 811, 331, 841, 895]) {
      expect(shown).not.toContain(p);
    }
    expect(shown).toEqual([136, 110, 109, 111, 205]);
  });

  it('shows the headlines repeated on all four subpages once', () => {
    expect(page.subpages).toHaveLength(4);
    const everyRow = toReaderBlocks(page, classify(page), { keepRepeatedRows: true });
    expect(headlines(everyRow).map((h) => h.page)).toEqual([136, 110, 109, 111, 205]);
  });
});

// ----------------------------------------------------- hand-made cases

describe('frontPage edge cases', () => {
  const base = load(100);

  it('no headlines: no lead and no groups', () => {
    const page = blank(
      base,
      Object.values(ROW).flatMap((r) => [r, r + 1]),
    );
    expect(frontPage(page)).toEqual({ lead: undefined, groups: [] });
  });

  it('only one headline: a lead and no groups', () => {
    const page = blank(base, [9, 10, 11, 12, 13, 15, 16]);
    expect(frontPage(page)).toEqual({
      lead: { page: 136, text: 'Putin: Olen valmis neuvotteluihin', section: 'world' },
      groups: [],
    });
  });

  it('only one section: a single group', () => {
    const page = blank(base, [ROW.putin, ROW.putin + 1, ROW.jokinen, ROW.jokinen + 1]);
    const model = frontPage(page);
    expect(model.lead?.page).toBe(110);
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].section).toBe('news');
    expect(model.groups[0].headlines.map((h) => h.page)).toEqual([109, 111]);
  });

  it('orders Kotimaa, Ulkomaat, Talous, Urheilu, then the rest as they appear', () => {
    let page = retarget(base, ROW.putin, 205); // lead
    page = retarget(page, ROW.palo, 811); // other, appears before weather
    page = retarget(page, ROW.verkko, 403); // weather
    page = retarget(page, ROW.katkos, 161); // business
    page = retarget(page, ROW.jokinen, 131); // world
    const model = frontPage(page);
    expect(model.lead?.page).toBe(205);
    expect(model.groups.map((g) => g.section)).toEqual(['world', 'business', 'other', 'weather']);
    expect(model.groups.map((g) => g.headlines.map((h) => h.page))).toEqual([
      [131],
      [161],
      [811],
      [403],
    ]);
  });

  it('keeps page 100 order inside a group', () => {
    let page = retarget(base, ROW.katkos, 103);
    page = retarget(page, ROW.jokinen, 102 + 20);
    const news = frontPage(page).groups.find((g) => g.section === 'news');
    expect(news?.headlines.map((h) => h.page)).toEqual([110, 109, 103, 122]);
  });

  it('leaves out a headline row that links to a section index page', () => {
    const page = retarget(base, ROW.palo, 101);
    const model = frontPage(page);
    const shown = [model.lead!, ...model.groups.flatMap((g) => g.headlines)].map((h) => h.page);
    expect(shown).toEqual([136, 109, 111, 205]);
  });

  it('shows a page linked twice once, with its first headline', () => {
    const page = retarget(base, ROW.verkko, 110);
    const news = frontPage(page).groups.find((g) => g.section === 'news');
    expect(news?.headlines).toEqual([
      { page: 110, text: 'Epäily: Jyväskylän palo tahallinen', section: 'news' },
      { page: 111, text: 'TEKSTI-TV:N NETTIVERSION KATKOS OHI', section: 'news' },
    ]);
  });

  it('treats the front page and the section index pages as navigation', () => {
    for (const p of [100, 101, 102, 130, 160, 199, 201]) expect(NAV_PAGES.has(p)).toBe(true);
  });
});

describe('headline section (sectionOf)', () => {
  it.each([
    [101, 'other'],
    [102, 'news'],
    [129, 'news'],
    [130, 'world'],
    [159, 'world'],
    [160, 'business'],
    [189, 'business'],
    [190, 'other'],
    [199, 'other'],
    [200, 'sport'],
    [299, 'sport'],
    [300, 'other'],
    [400, 'weather'],
    [499, 'weather'],
    [811, 'other'],
  ])('%i → %s', (page, section) => {
    expect(sectionOf(page).id).toBe(section);
  });
});

// --------------------------------------------------------------- ingress

describe('ingress', () => {
  it.each([
    [
      103,
      'Keskiviikkona aamulla liikenteessä kannattaa olla tarkkana: huonosta ajokelistä varoitetaan maan itäosassa sekä Uudenmaan, Päijät-Hämeen ja Keski-Suomen maakunnissa kuuraisten teiden vuoksi.',
    ],
    [
      104,
      'Limingassa neljä ihmistä loukkaantui vakavasti, kun henkilöauto törmäsi liikenneopasteen tolppaan myöhään tiistaina. Asiasta kertoo Pohjois-Pohjanmaan pelastuslaitos.',
    ],
    [
      105,
      'Jyväskylässä Hämeenkadulla tapahtuneessa kerrostalopalossa on kuollut yksi mies. Neljä ihmistä on toimitettu sairaalaan, kertoo Keski-Suomen pelastuslaitos.',
    ],
    [
      136,
      'Venäjän presidentti Vladimir Putin sanoo olevansa periaatteessa valmis aloittamaan uudelleen Ukrainan rauhanneuvottelut marraskuun puolessavälissä.',
    ],
  ])('page %i: the first paragraph, whole and unchanged', (n, expected) => {
    expect(ingress(load(n))).toBe(expected);
  });

  it('keeps every word of the first paragraph rows, in order', () => {
    // Row 6–10 of 105, joined only by line breaks → spaces.
    const rows = load(105)
      .subpages[0].lines.filter((l) => l.number >= 6 && l.number <= 10)
      .map((l) => l.text.trim());
    expect(ingress(load(105))).toBe(rows.join(' '));
  });

  it.each([
    [100, 'front page: link lists only'],
    [102, 'section index: starts "Keskiviikon uutisia:" with no heading'],
    [230, 'results table'],
    [237, 'table caption before any heading'],
    [410, 'heading followed by a link list'],
    [890, 'mosaic graphics before any heading'],
  ])('page %i has no ingress (%s)', (n) => {
    expect(ingress(load(n))).toBeUndefined();
  });

  it('a heading with no text below it has no ingress', () => {
    const rows = Array.from({ length: 19 }, (_, i) => i + 6); // rows 6–24
    expect(ingress(blank(load(105), rows))).toBeUndefined();
  });

  it.each([103, 104, 105, 109, 110, 131, 132, 136, 161, 162, 163, 205])(
    'page %i (an article with a heading): the headline does not change the choice',
    (n) => {
      expect(ingress(load(n), 'Jotain aivan muuta Ezeh Tedenby Putin')).toBe(ingress(load(n)));
    },
  );

  // 202 URHEILUSÄHKEET (24.10.2026): no heading, four short stories, each a
  // paragraph starting with the sport (`PESÄPALLO:`, `JALKAPALLO:`). Page 201
  // listed it twice that evening, under two different headlines.
  const PESAPALLO =
    'PESÄPALLO: Naisten Superpesiksen kaikkien aikojen lyöjäkuningatar Janette Lepistö jatkaa Lapuan Virkiässä ensi kaudella. Manse PP:n Virpi Hukka siirtyy MTV:n tietojen mukaan Porin Pesäkarhuihin.';

  it('bulletin page 202 with no headline: its first story, whole and unchanged', () => {
    expect(ingress(load(202))).toBe(PESAPALLO);
  });

  it('bulletin page 202 under a general headline: its first story', () => {
    // 201 on 21.10.2026 listed 202 as `Urheilusähkeitä`.
    expect(ingress(load(202), 'Urheilusähkeitä')).toBe(PESAPALLO);
  });

  it.each([
    ['David Ezeh siirtyy HJK:sta KuPSiin', 'JALKAPALLO: Hyökkääjä David Ezeh on tehnyt'],
    ['HPK pestasi Mattias Tedenbyn', 'JÄÄKIEKKO: SM-liigan HPK tiedotti'],
  ])('bulletin page 202 under "%s": the story it names (also on subpage 2)', (headline, start) => {
    const text = ingress(load(202), headline);
    expect(text?.startsWith(start)).toBe(true);
    // Whole paragraph, unchanged: it is one of the page's own paragraphs.
    const paragraphs = toReaderBlocks(load(202)).flatMap((b) =>
      b.kind === 'paragraph' ? [b.segments.map((s) => s.text).join('')] : [],
    );
    expect(paragraphs).toContain(text);
  });

  it('a single shared word is not enough to pick another story', () => {
    // `Suomi` is in the AM.JALKAPALLO story only; one word could be chance.
    expect(ingress(load(202), 'Suomi ihmeissään')).toBe(PESAPALLO);
  });

  it.each([
    [203, 'Mononen juoksi SM-maastomestariksi', 'results: caption, then a table'],
    [207, 'F1:n aika-ajot yöllä Yhdysvalloissa', 'lap times table only'],
    [218, 'Moltzan vei naisten alppiavauksen', 'place and race name, then results'],
    [221, 'HIFK ja Jokerit voittivat 6-3', 'scores table'],
  ])('sports result page %i has no paragraph to show (%s; %s)', (n, headline) => {
    expect(ingress(load(n), headline)).toBeUndefined();
    expect(ingress(load(n))).toBeUndefined();
  });
});

describe('isProse', () => {
  it.each([
    ['Keskiviikon uutisia:', false],
    ['MESTARUUSSARJA', false],
    ['Lauantai', false],
    ['Miesten 10 km', false],
    ['Sarkkisen taival päättyi.', false], // a sentence, but too short to tell
    ['MAALIPÖRSSI 18.10.', false],
    ['JÄÄKIEKKO: SM-LIIGAN HPK TIEDOTTI TEHNEENSÄ SOPIMUKSEN.', false],
    ['PESÄPALLO: Naisten Superpesiksen lyöjäkuningatar jatkaa ensi kaudella.', true],
    ['Hän sanoi: "Päätös perustuu täysin urheilullisuuteen."', true],
  ])('%s → %s', (text, expected) => {
    expect(isProse(text)).toBe(expected);
  });
});
