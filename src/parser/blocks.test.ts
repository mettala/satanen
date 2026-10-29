import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  BAR_FIRST_PAGES,
  barsFirst,
  COLUMN_PAGES,
  contactRows,
  headerName,
  HIDDEN_LINK_PAGES,
  LETTER_HEADING_PAGES,
  pageStamp,
  repeatedFooters,
  repeatedRows,
  SORTED_LINK_PAGES,
  sortLinkLists,
  toReaderBlocks,
  trendMarks,
  withoutLinks,
  type ContactBlock,
  type LinkEntry,
  type LinkListBlock,
  type ParagraphBlock,
  type ReaderBlock,
  type SubpageDividerBlock,
  type TableBlock,
} from './blocks';
import { classify, type ClassifiedLine, type ReaderLink } from './classify';
import type { Page } from './model';
import { normalize } from './normalize';
import { hyphenJoin, joinWrapped } from './reflow';

const here = fileURLToPath(new URL('.', import.meta.url));
const pagesDir = resolve(here, '../../fixtures/pages');

function load(n: number | string): Page | undefined {
  const result = normalize(JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8')));
  return result.ok ? result.page : undefined;
}

const cache = new Map<number, ReaderBlock[]>();
function blocks(n: number): ReaderBlock[] {
  let b = cache.get(n);
  if (!b) {
    const page = load(n);
    if (!page) throw new Error(`fixture ${n} does not normalise`);
    b = toReaderBlocks(page);
    cache.set(n, b);
  }
  return b;
}

function dividers(n: number): SubpageDividerBlock[] {
  return blocks(n).filter((b): b is SubpageDividerBlock => b.kind === 'subpageDivider');
}

/** Blocks of subpage `sp` only (between its dividers). */
function subpage(n: number, sp: number): ReaderBlock[] {
  const out: ReaderBlock[] = [];
  let current = 1;
  for (const b of blocks(n)) {
    if (b.kind === 'subpageDivider') current = b.number;
    else if (current === sp) out.push(b);
  }
  return out;
}

/** Paragraph as plain text; links shown as `[text]`. */
function plain(p: ParagraphBlock): string {
  return p.segments.map((s) => (s.kind === 'link' ? `[${s.text}]` : s.text)).join('');
}

function paragraphs(bs: ReaderBlock[]): string[] {
  return bs.filter((b): b is ParagraphBlock => b.kind === 'paragraph').map(plain);
}

function lists(bs: ReaderBlock[]): LinkListBlock[] {
  return bs.filter((b): b is LinkListBlock => b.kind === 'linkList');
}

/** `[linkText, label]` pairs of every entry, in order. */
function entries(bs: ReaderBlock[]): [string, string][] {
  return lists(bs).flatMap((l) => l.entries.map((e): [string, string] => [e.linkText, e.label]));
}

function allText(bs: ReaderBlock[]): string {
  return paragraphs(bs).join('\n\n');
}

const page = (p: number): ReaderLink => ({ kind: 'page', page: p });
const range = (from: number, to: number): ReaderLink => ({ kind: 'range', from, to });

describe('blocks: headings and paragraphs', () => {
  it('turns the double-height title into one heading (103)', () => {
    expect(blocks(103)[0]).toEqual({ kind: 'heading', text: 'Etelässä odotetaan lämpenemistä' });
  });

  it('joins wrapped rows into one paragraph and starts a new one at blank rows (103)', () => {
    const ps = paragraphs(blocks(103));
    expect(ps).toHaveLength(3);
    expect(ps[0]).toBe(
      'Keskiviikkona aamulla liikenteessä kannattaa olla tarkkana: huonosta ajokelistä ' +
        'varoitetaan maan itäosassa sekä Uudenmaan, Päijät-Hämeen ja Keski-Suomen maakunnissa ' +
        'kuuraisten teiden vuoksi.',
    );
  });

  it('treats a row with 2 or fewer spare cells as wrapped (103 "lähes koko" + "maassa,", 161)', () => {
    expect(paragraphs(blocks(103))[2]).toBe(
      'Illalla sää selkenee lähes koko maassa, ja lämpötilat laskevat niin ikään laajalti ' +
        'alle viiden asteen.',
    );
    expect(paragraphs(blocks(161))[0]).toContain('laskuun sen jälkeen');
    expect(paragraphs(blocks(161)).filter((p) => p.includes('\n'))).toEqual([]);
  });

  it('starts a new paragraph at a deliberate break after a full stop (725, no blank rows)', () => {
    const ps = paragraphs(subpage(725, 1));
    expect(ps[0].endsWith('det bästa alternativet för forsen.')).toBe(true);
    expect(ps[1].startsWith('Nu har Helsingfors stad utrett vad som')).toBe(true);
  });

  it('keeps a deliberate break without a full stop as a line break (725 title row)', () => {
    expect(paragraphs(subpage(725, 1))[0]).toMatch(
      /^Så här ska Helsingfors rädda fiskarna i Gammelstadsforsen\nGammelstadsforsens framtid/,
    );
  });

  it('breaks the line before an indented row (175 abbreviation list)', () => {
    expect(paragraphs(subpage(175, 2))).toContain(
      'Sivuilla käytetään seuraavia lyhenteitä\nT - tuhat\nM - miljoona\n' +
        'KK - tuotteen päättymiskuukausi\nTH - tuotteen toteutushinta',
    );
  });

  it('starts a new line at a "Field:" row (417 Ajankohta / Työaika / Puh)', () => {
    const ps = paragraphs(subpage(417, 1));
    expect(ps).toContain('Ajankohta: 07.04.2026 - 04.12.2026.');
    expect(ps).toContain('Työaika: ma-la 06:00-18:00');
    expect(ps).toContain('Fintraffic Tieliikennekeskus\nPuh: 02002100\nSähköposti:');
    expect(paragraphs(subpage(417, 4))).toContain(
      'Yksi ajokaista suljettu\nNopeusrajoitus: 50 km/h\nMatka, jolla nopeusrajoitus voimassa: 400 m',
    );
  });

  it('turns a wide gap inside a row into a line break (301 legend, 190 weather legend)', () => {
    expect(paragraphs(subpage(301, 1))).toContain(
      'T = Tekstitys\nA = Jo Areenassa\nA = Tulee Areenaan',
    );
    expect(allText(blocks(190))).toContain('se = clear\npp,pi = clouds\nuk = thunder');
  });
});

describe('blocks: hyphens at the end of a row', () => {
  it('drops soft hyphens inside a word (161, 162, 410, 418)', () => {
    expect(allText(blocks(161))).toContain('tuore neljännesvuosikatsaus ei');
    const t162 = allText(blocks(162));
    expect(t162).toContain('autovalmistaja Teslan');
    expect(t162).toContain('perustettu erityiskomiteat,');
    expect(t162).toContain('ensimmäisestä vuosineljänneksen');
    expect(allText(subpage(410, 2))).toContain('liikennöitävyydestä voi');
    const t418 = allText(subpage(418, 1));
    for (const w of ['vähäinen,', 'kohtalaiseksi.', 'laskevat', 'yöpakkasten', 'lumipeitteen']) {
      expect(t418).toContain(w);
    }
    // Last part of the word on an indented row: still joined.
    expect(t418).toContain('siitepölyn kulkeutumilla.');
  });

  it('keeps the hyphen when the next row starts with a capital (401 sp2)', () => {
    const t = allText(subpage(401, 2));
    expect(t).toContain('Iltapäivällä Pohjois-Pohjanmaalla');
    expect(t).toContain('Pohjois-Savon, Pohjois-Karjalan ja Keski-Pohjanmaan');
  });

  it('keeps a suspended hyphen and the space before a conjunction (163)', () => {
    expect(allText(blocks(163))).toContain('hyvät talouskasvu- ja työllisyyslukemat');
  });

  it('keeps the hyphen in a month range (410 "(loka-" + "huhtikuu)")', () => {
    expect(allText(subpage(410, 2))).toContain('sivulle [414] (loka-huhtikuu)');
    expect(entries(subpage(410, 1))).toContainEqual([
      '414',
      'Koko maan kelitiedot (loka-huhtikuu)',
    ]);
  });

  it('keeps the hyphen after digits (405 "22.-" + "26.10.2026:")', () => {
    expect(allText(blocks(405))).toContain('ennuste ajalle 22.-26.10.2026:');
  });

  it('keeps the hyphen after a capitalised word part (418 "Alternaria-" + "homesienen")', () => {
    expect(allText(subpage(418, 1))).toContain('Cladosporium- ja Alternaria-homesienen');
  });

  it('never touches hyphens inside a row (103 "Päijät-Hämeen", 161 "heinä-syyskuun")', () => {
    expect(allText(blocks(103))).toContain('Päijät-Hämeen');
    expect(allText(blocks(161))).toContain('heinä-syyskuun');
  });

  it('keeps hyphens Finnish spelling needs, as written in-row on fixtures', () => {
    // Same vowel across the join: "drooni-iskuja" (132), "linja-auto".
    expect(allText(blocks(132))).toContain('drooni-iskuja');
    expect(hyphenJoin('drooni-', 'iskuja')).toBe('keep');
    // No vowel before the hyphen (an abbreviation): "tv-taajuudet" (575).
    expect(entries(blocks(575))).toContainEqual(['582', 'Digita: radio- ja tv-taajuudet']);
    expect(hyphenJoin('tv-', 'taajuudet')).toBe('keep');
    // The soft case for comparison (161).
    expect(hyphenJoin('neljännes-', 'vuosikatsaus')).toBe('soft');
  });

  it('keeps the hyphen after a single letter (575 "s-posti")', () => {
    expect(entries(blocks(575))).toContainEqual(['577', 'Digitan puhelinpalvelut, s-posti']);
    expect(hyphenJoin('s-', 'posti')).toBe('keep');
    expect(hyphenJoin('e-', 'kirja')).toBe('keep');
  });

  it('joins after a slash without a space (199 "Helsinki/" + "Uusimaa")', () => {
    expect(entries(subpage(199, 1))).toContainEqual(['516', 'Helsinki/Uusimaa']);
    expect(joinWrapped('Helsinki/', 'Uusimaa')).toBe('Helsinki/Uusimaa');
  });
});

describe('blocks: inline page links', () => {
  function links(bs: ReaderBlock[]) {
    return bs
      .filter((b): b is ParagraphBlock => b.kind === 'paragraph')
      .flatMap((p) => p.segments.filter((s) => s.kind === 'link'));
  }

  it('links page numbers after "sivuilla" / "sivulle" (410 sp2)', () => {
    expect(links(subpage(410, 2))).toEqual([
      { kind: 'link', text: '411-413', target: range(411, 413) },
      { kind: 'link', text: '414', target: page(414) },
      { kind: 'link', text: '415-417', target: range(415, 417) },
      { kind: 'link', text: 'www.vayla.fi', target: { kind: 'url', href: 'https://www.vayla.fi' } },
    ]);
  });

  it('a row of only "Name s. 241" is a link named by the words before "s." (242 sp4, 263)', () => {
    expect(entries(subpage(242, 4))).toEqual([['241', 'Otteluseuranta']]);
    expect(entries(blocks(263))).toEqual([
      ['261', 'Otteluseuranta'],
      ['261', 'Otteluseuranta'],
    ]);
    expect(allText(blocks(242))).not.toContain('Otteluseuranta s.');
  });

  it('links a chain joined by "," and "ja" after a page word (330)', () => {
    const ps = paragraphs(blocks(330));
    expect(ps).toContain('335 Uutistekstitys sivuilla [333] ja [334]');
    expect(ps.find((p) => p.startsWith('Sivuilla'))).toMatch(
      /^Sivuilla \[301\],\[302\],\[305\],\[310-317\] ja \[321-322\] T-symboli/,
    );
    // "(på svenska 774,775 )": no page word, so plain text.
    expect(allText(blocks(330))).toContain('(på svenska 774,775 )');
  });

  it('does not link numbers that Yle marked but are not page references', () => {
    expect(allText(blocks(162))).toContain('kasvoi 161 prosenttia');
    expect(links(blocks(162))).toEqual([]);
    expect(paragraphs(blocks(175))[0]).toBe('OMXH 13 206,91 ( +0,64 )');
    expect(links(blocks(175))).toEqual([]);
    expect(allText(subpage(725, 3))).toContain('kraschade 150 stycken');
    expect(allText(subpage(417, 1))).toContain('voimassa: 200 m');
    expect(links(blocks(417)).filter((l) => l.target.kind !== 'url')).toEqual([]);
  });

  it('keeps a sentence with counts Yle marked as links one paragraph (202 sp2)', () => {
    const bs = subpage(202, 2);
    expect(bs.map((b) => b.kind)).toEqual(['paragraph']);
    expect(paragraphs(bs)).toEqual([
      'JÄÄKIEKKO: SM-liigan HPK tiedotti tehneensä loppukauden sopimuksen 36-vuotiaan ' +
        'hyökkääjän Mattias Tedenbyn kanssa. Ruotsalaishyökkääjä on pelannut urallaan ' +
        '120 NHL-ottelua ja 126 AHL-ottelua sekä voittanut kolme Ruotsin mestaruutta. ' +
        'Edelliset neljä kautta hän pelasi SHL:ssä HV71:ssä.',
    ]);
    expect(lists(blocks(202))).toEqual([]);
  });

  it('still links a page reference on a running-text row (410/2 "sivulle 414")', () => {
    // classify.test.ts checks that this row is `running-text`.
    expect(allText(subpage(410, 2))).toContain('sivulle [414]');
  });

  it('keeps no links in table rows (301 ">352")', () => {
    const t = subpage(301, 1).find((b): b is TableBlock => b.kind === 'table');
    expect(t?.lines).toContain('23.50 Kuka uskois (12) T A >352');
  });
});

describe('blocks: link lists', () => {
  it('turns a run of headline rows into one list with labels (102)', () => {
    const bs = blocks(102);
    expect(paragraphs(bs)).toEqual(['Keskiviikon uutisia:']);
    const [news, bar] = lists(bs);
    expect(news.variant).toBe('list');
    expect(news.entries[0]).toEqual({
      label: 'Etelässä odotetaan lämpenemistä',
      target: page(103),
      linkText: '103',
    });
    expect(news.entries).toHaveLength(10);
    expect(bar.variant).toBe('bar');
  });

  it('keeps headlines separated by blank rows in one list (100)', () => {
    const [top, news, bottom] = lists(subpage(100, 1));
    expect(top.entries.map((e) => e.linkText)).toEqual(['yle.fi/tekstitv', '199']);
    expect(news.entries.map((e) => e.linkText)).toEqual(['136', '110', '109', '111', '205']);
    expect(bottom.variant).toBe('bar');
    expect(bottom.entries).toHaveLength(14);
  });

  it('makes coloured bars their own list with variant "bar" (100, 101)', () => {
    expect(lists(subpage(100, 1)).map((l) => l.variant)).toEqual(['bar', 'list', 'bar']);
    const last = lists(blocks(101)).at(-1);
    expect(last).toEqual({
      kind: 'linkList',
      variant: 'bar',
      entries: [
        { label: 'AAKKOSELLINEN HAKEMISTO', target: range(196, 198), linkText: '196 - 198' },
      ],
    });
  });

  it('uses the text before a link as its label (100 "Sää paikkakunnittain 406-408")', () => {
    expect(entries(subpage(100, 1))).toContainEqual(['406-408', 'Sää paikkakunnittain']);
  });

  it('leaves the label empty for a link-only row (190, 100)', () => {
    expect(entries(blocks(190))).toContainEqual(['yle.fi/news', '']);
    expect(entries(blocks(190))).toContainEqual(['426-427', '']);
  });

  it('appends continuation rows to the entry above (175, 400, 575)', () => {
    expect(entries(blocks(175))).toContainEqual(['187', 'Vaihtoehtoiset ja kiinteistörahastot']);
    expect(entries(blocks(400))).toContainEqual([
      '402',
      'Sää maa-asemilla ja lämpötiloja ulkomailla',
    ]);
    expect(entries(blocks(400))).toContainEqual([
      '406-407',
      'Sää paikkakunnittain: tänään & 3 vrk (selitteet 419)',
    ]);
    expect(entries(blocks(575))).toContainEqual([
      '589',
      'Digisovittimen hankinta, teksti-tv, kieliasetukset ym. * Laitekohtainen ' +
        'Digi/HD-neuvonta laitevalmistajilta',
    ]);
  });

  it('matches continuation text to the entry above it by column (199 sp2)', () => {
    const es = entries(subpage(199, 2));
    expect(es).toContainEqual(['310-312', 'Ylen kanavat huomenna']);
    expect(es).toContainEqual(['315-317', 'Ylen kanavat ylihuomenna']);
    expect(es).toContainEqual(['350', 'OHJELMAOPAS Lisää ohjelmista']);
  });

  it('appends leftover text on a link row to the entry above (199, 101)', () => {
    expect(entries(subpage(199, 1))).toContainEqual(['196-198', 'Aakkosellinen hakemisto']);
    expect(entries(subpage(199, 2))).toContainEqual(['305', 'Yle Teema & Fem']);
    expect(entries(subpage(199, 2))).toContainEqual(['359-360', 'Yle Teema & Fem']);
    expect(entries(blocks(101))).toContainEqual(['599', 'Teksti-TV:n yhteystiedot']);
  });

  it('keeps leftover text that is not a continuation as a paragraph between lists (101)', () => {
    // Without 101's sorted list (see "sorted link lists" below).
    const bs = toReaderBlocks(load(101)!, undefined, { sortLinks: false });
    const i = bs.findIndex((b) => b.kind === 'paragraph' && plain(b) === 'UUTISET');
    expect(i).toBeGreaterThan(0);
    expect(bs[i - 1].kind).toBe('linkList');
    expect((bs[i + 1] as LinkListBlock).entries[0].label).toBe('News in English');
  });

  it('never gives two links the same words (301 sp2 bar "TV1 huomenna 310  ylihuomenna 315")', () => {
    const bar = lists(subpage(301, 2)).at(-1);
    expect(bar?.entries).toEqual([
      { label: 'TV1 huomenna', target: page(310), linkText: '310' },
      { label: 'ylihuomenna', target: page(315), linkText: '315' },
    ]);
    const words = subpage(301, 2)
      .flatMap((b) =>
        b.kind === 'linkList'
          ? b.entries.map((e) => e.label)
          : b.kind === 'paragraph'
            ? [plain(b)]
            : [],
      )
      .join(' ');
    expect(words.match(/ylihuomenna/g)).toHaveLength(1);
    expect(paragraphs(subpage(301, 2))).toEqual([]);
  });

  it('makes links joined by a comma one entry (199 sp2, sp4)', () => {
    const l = lists(subpage(199, 2))[0].entries.find((e) => e.linkText === '340,345-346');
    expect(l).toEqual({ label: 'Yle Radio1', target: page(340), linkText: '340,345-346' });
    expect(entries(subpage(199, 4))).toContainEqual(['861-862,870', 'Kuluttaja']);
  });
});

describe('blocks: page references (RP.6)', () => {
  /** Labels of the coloured bars on subpage `sp`, as `[linkText, label]`. */
  const bars = (n: number, sp: number) =>
    entries(subpage(n, sp).filter((b) => b.kind === 'linkList' && b.variant === 'bar'));

  it('408: "selitteet s.419" is the link "selitteet"; the issue time is text, once', () => {
    const bs = blocks(408);
    expect(bs.slice(0, 2)).toEqual([
      { kind: 'paragraph', segments: [{ kind: 'text', text: '21.10. klo 15.30' }] },
      {
        kind: 'linkList',
        variant: 'bar',
        entries: [{ label: 'selitteet', target: page(419), linkText: '419' }],
      },
    ]);
    // Row 2 is the same on all three subpages: shown once.
    expect(entries(bs)).toHaveLength(1);
    // 406 and 407 have the same row.
    expect(bars(406, 1)).toEqual([['419', 'selitteet']]);
    expect(bars(407, 1)).toEqual([['419', 'selitteet']]);
  });

  it('891: "Ajatus päivälle s. 895" is the link "Ajatus päivälle"', () => {
    expect(bars(891, 1)).toEqual([['895', 'Ajatus päivälle']]);
  });

  it('196: bars name their links without "s." / "sivu" / "på s." (the number was there)', () => {
    expect(bars(196, 1)).toEqual([['799', 'Svenska sidor index']]);
    expect(bars(196, 2)).toEqual([
      ['197', 'M-S'],
      ['198', 'T-Y'],
    ]);
    expect(bars(196, 3)).toEqual([['199', 'Päähakemistojen kooste']]);
    // The `>>>` arrows after 799 and 198 are Yle's next-subpage markers: gone.
    expect(JSON.stringify(blocks(196))).not.toContain('>>>');
  });

  it('other bars with "s." lose it too (199, 301, 330, 419)', () => {
    expect(bars(199, 4)).toEqual([['196-198', 'Aakkosellinen hakemisto']]);
    expect(bars(301, 3)).toEqual([['300', 'TV-ohjelmien hakemisto']]);
    expect(bars(330, 1)).toEqual([['350', 'Teksti-TV:n ohjelmaopas']]);
    expect(bars(419, 1)[0]).toEqual(['406-408', 'Sää paikkakunnittain']);
  });

  it('189: "Keskihinnat s.188" is the link "Keskihinnat"; next-subpage hints are gone', () => {
    expect(entries(subpage(189, 2))).toEqual([['188', 'Keskihinnat']]);
    // No page word: plain text, as on teletext, no chip.
    expect(paragraphs(subpage(189, 1)).at(-1)).toBe('Tuntikeskihinnat 188');
    expect(entries(subpage(189, 1))).toEqual([]);
    // Subpages 3 and 4 end like 2 and 1 did: shown once.
    expect(entries(subpage(189, 3))).toEqual([]);
    expect(paragraphs(subpage(189, 4)).join(' ')).not.toContain('Tuntikeskihinnat');
    const text = JSON.stringify(blocks(189));
    expect(text).not.toContain('>');
    expect(text).not.toContain('Huomenna klo 00-12 >>');
    // What the hints pointed at is still there, on the next subpage (its table's caption, RP.9).
    expect(subpage(189, 3)).toContainEqual({
      kind: 'heading',
      text: 'Huomenna klo 00-12 (hinta 15min välein)',
    });
  });

  it('keeps a next-subpage hint whose words are on no other subpage', () => {
    const p = load(189)!;
    const alone = { ...p, subpages: [p.subpages[1]], subpageCount: 1 };
    expect(paragraphs(toReaderBlocks(alone)).at(-1)).toBe(
      'Keskihinnat s.[188] Huomenna klo 00-12 >>',
    );
  });

  it('a page word with no link stays plain text, never a chip (408, 891 without the link)', () => {
    for (const [n, r] of [
      [408, 2],
      [891, 23],
    ] as const) {
      const p = structuredClone(load(n)!);
      for (const sp of p.subpages) {
        for (const run of sp.lines.find((l) => l.number === r)!.runs) delete run.link;
      }
      const bs = toReaderBlocks(p, classify(p));
      expect(entries(bs), String(n)).toEqual([]);
      const shown = JSON.stringify(bs);
      expect(shown, String(n)).toContain(n === 408 ? 'selitteet s.419' : 'Ajatus päivälle s. 895');
    }
  });
});

describe('blocks: stock, fund and price tables (RP.9)', () => {
  const tablesOf = (bs: ReaderBlock[]) => bs.filter((b): b is TableBlock => b.kind === 'table');
  const titlesOf = (bs: ReaderBlock[]) =>
    bs.filter((b) => b.kind === 'title').map((b) => (b as { text: string }).text);
  const stampOf = (n: number) => pageStamp(classify(load(n)!));

  it('184: title, stamp, one table per subpage with its two header rows, 16 subpages', () => {
    expect(titlesOf(blocks(184))).toEqual(['Osakerahastot O-Z']);
    expect(stampOf(184)).toEqual({ text: 'Rahastojen arvot 24.10. 20:40', row: 1, column: 3 });
    const shown = JSON.stringify(blocks(184));
    expect(shown).not.toContain('Rahastojen arvot');
    expect(shown).not.toMatch(/\bsn\b/);
    expect(dividers(184).map((d) => `${d.number}/${d.count}`)).toEqual(
      Array.from({ length: 15 }, (_, i) => `${i + 2}/16`),
    );
    expect(dividers(184).every((d) => d.titles.length === 0)).toBe(true);
    for (let sp = 1; sp <= 16; sp++) {
      const [table, ...rest] = tablesOf(subpage(184, sp));
      expect(rest, `184/${sp}`).toEqual([]);
      expect(table.headerRows, `184/${sp}`).toBe(2);
      expect(table.lines.slice(0, 2), `184/${sp}`).toEqual([
        '              OSUUDEN    MUUTOS  MUUTOS',
        '                 ARVO PV %EDELL   %12KK',
      ]);
    }
    expect(tablesOf(subpage(184, 1))[0].lines[2]).toBe('ODINEMER1   21,62 EUR 22  -2,03  +21,62');
    // No heading: `ARVO PV %EDELL %12KK` is no longer a big title.
    expect(blocks(184).some((b) => b.kind === 'heading')).toBe(false);
  });

  it('176: the title comes off the labels row; the table keeps both label rows', () => {
    expect(titlesOf(blocks(176))).toEqual(['OMXH Large Cap']);
    expect(stampOf(176)?.text).toBe('Helsingin Pörssi 23.10. 18:35');
    const [table] = tablesOf(subpage(176, 1));
    expect(table.headerRows).toBe(2);
    expect(table.lines.slice(0, 4)).toEqual([
      '                  AIKA VAIHTO/e MUUTOS%',
      '  OSTO  MYYNTI    ALIN     YLIN    VIIM',
      'Elisa Class A    19:00   23,41M   -5,89',
      ' 32,64   32,68   32,52    34,00   32,58',
    ]);
  });

  it('187: a title wrapped into the labels row is one title', () => {
    expect(titlesOf(blocks(187))).toEqual(['Vaihtoehtoiset ja kiinteistörahastot']);
    expect(tablesOf(subpage(187, 1))[0].lines[0]).toBe('              OSUUDEN    MUUTOS  MUUTOS');
  });

  it('189: `Nord Pool Pörssisähkö`, the time in the meta line, a heading over each price table', () => {
    expect(titlesOf(blocks(189))).toEqual(['Nord Pool Pörssisähkö']);
    expect(stampOf(189)).toEqual({ text: '25.10. klo 23.10', row: 2, column: 24 });
    expect(dividers(189).map((d) => [`${d.number}/${d.count}`, d.titles])).toEqual([
      ['2/4', []],
      ['3/4', []],
      ['4/4', []],
    ]);
    const kinds = (sp: number) => subpage(189, sp).map((b) => b.kind);
    expect(kinds(1).slice(0, 4)).toEqual(['title', 'paragraph', 'heading', 'table']);
    for (const sp of [2, 3, 4]) {
      expect(kinds(sp).slice(0, 3), `189/${sp}`).toEqual(['paragraph', 'heading', 'table']);
    }
    expect(paragraphs(subpage(189, 1))[0]).toBe('Hinta nyt 0,25 snt/kWh (sis. ALV:n)');
    expect(subpage(189, 3)[1]).toEqual({
      kind: 'heading',
      text: 'Huomenna klo 00-12 (hinta 15min välein)',
    });
    // Price tables keep their hour labels in the first column.
    const prices = tablesOf(subpage(189, 2))[0].lines;
    expect(prices.filter((l) => /^\d\d /.test(l)).map((l) => l.slice(0, 2))).toEqual([
      '12',
      '13',
      '14',
    ]);
    expect(prices[0]).toBe('12   0,19 15   0,38 18   0,45 21   0,31');
  });

  it('175: the stamp in its header row; 404: the sea-level table has its heading', () => {
    expect(stampOf(175)?.text).toBe('Helsingin Pörssi 21.10. 18:34');
    expect(JSON.stringify(blocks(175))).not.toContain('Helsingin Pörssi');
    const i = blocks(404).findIndex((b) => b.kind === 'heading');
    expect(blocks(404)[i]).toEqual({
      kind: 'heading',
      text: 'MERIVEDEN KORKEUS (teoreett. keskivesi)',
    });
    expect(blocks(404)[i + 1].kind).toBe('table');
  });

  it('298: the F1 winners table counts its column header row', () => {
    const headed = tablesOf(blocks(298)).filter((t) => t.headerRows !== undefined);
    expect(headed.length).toBeGreaterThan(0);
    for (const t of headed) expect(t.headerRows).toBe(1);
  });

  it('stamp: only a date with a clock time counts, word for word as Yle wrote it', () => {
    const hits: string[] = [];
    for (const f of readdirSync(pagesDir).filter((x) => x.endsWith('.json'))) {
      const p = load(f.replace('.json', ''));
      if (!p) continue;
      const sps = classify(p);
      const s = pageStamp(sps);
      if (!s) continue;
      hits.push(String(p.number));
      // Verbatim: the same characters at the same place on the row.
      const line = sps[0].lines.find((l) => l.number === s.row)!.line;
      expect(line.text.slice(s.column, s.column + s.text.length), f).toBe(s.text);
    }
    // 402 `21.10. klo 20` and 404 `21.10. klo 18` give an hour, not a time: no stamp.
    expect(hits.sort()).toEqual(['175', '176', '184', '187', '189']);
    expect(pageStamp(classify(load(103)!))).toBeUndefined();
  });
});

describe('blocks: rising and falling prices (RP.13)', () => {
  const tablesOf = (bs: ReaderBlock[]) => bs.filter((b): b is TableBlock => b.kind === 'table');
  /** The table's marks as `line: value up|down`, read back from its lines. */
  const marked = (t: TableBlock) =>
    (t.trends ?? []).map(
      (m) => `${m.line}: ${t.lines[m.line].slice(m.column, m.column + m.length)} ${m.trend}`,
    );

  it('176: yellow `+` changes rise, cyan `-` changes fall; the text is unchanged', () => {
    const [table] = tablesOf(subpage(176, 1));
    expect(table.lines[2]).toBe('Elisa Class A    19:00   23,41M   -5,89');
    expect(marked(table).slice(0, 4)).toEqual([
      '2: -5,89 down',
      '4: -1,97 down',
      '6: +0,52 up',
      '8: -11,70 down',
    ]);
    // One mark per stock row; price rows (`32,64 32,68 …`) and labels have none.
    expect(table.trends).toHaveLength(9);
  });

  it('184: both change columns, also when Yle sends them as one run', () => {
    const [table] = tablesOf(subpage(184, 1));
    expect(marked(table).slice(0, 2)).toEqual(['2: -2,03 down', '2: +21,62 up']);
    // `{Yellow}+0,15 {Yellow}+30,82`: one yellow run in `structured`.
    const i = table.lines.findIndex((l) => l.startsWith('ODINNORGB1'));
    expect(marked(table).filter((m) => m.startsWith(`${i}:`))).toEqual([
      `${i}: +0,15 up`,
      `${i}: +30,82 up`,
    ]);
  });

  it('187: `+0,00` is yellow so it rises; a white `-` (no data) is not marked', () => {
    const [table] = tablesOf(subpage(187, 2));
    const row = (name: string) => {
      const i = table.lines.findIndex((l) => l.startsWith(name));
      return marked(table).filter((m) => m.startsWith(`${i}:`));
    };
    expect(row('ALXPAAIFB')).toEqual([expect.stringContaining('+0,00 up'), expect.anything()]);
    expect(row('BNYDFPV10W')).toEqual([expect.stringContaining('-0,86 down')]);
  });

  it('every signed number in the stock and fund tables is marked, by its own sign', () => {
    for (const n of [176, 184, 187]) {
      for (const t of tablesOf(blocks(n))) {
        const values = t.lines.flatMap((l) => l.match(/(?<=\s|^)[+-]\d+,\d+(?=\s|$)/g) ?? []);
        expect(t.trends?.length ?? 0, `${n}`).toBe(values.length);
        for (const m of marked(t)) expect(m, `${n}`).toMatch(/: \+\S+ up$|: -\S+ down$/);
      }
    }
  });

  it('no other fixture gets marks (175 keeps its index line as text)', () => {
    for (const f of readdirSync(pagesDir).filter((x) => x.endsWith('.json'))) {
      const n = Number.parseInt(f, 10);
      if ([176, 184, 187].includes(n) || !load(n)) continue;
      expect(JSON.stringify(blocks(n)), f).not.toContain('"trends"');
    }
  });

  it('only in a table with a MUUTOS label, and only when colour and sign agree', () => {
    // 184 with its change labels renamed: the same coloured values stay plain.
    const page = structuredClone(load(184)!);
    for (const sp of page.subpages) {
      for (const line of sp.lines.filter((l) => l.number <= 4)) {
        line.text = line.text.replaceAll('MUUTOS', 'XXXXXX');
        for (const run of line.runs) run.text = run.text.replaceAll('MUUTOS', 'XXXXXX');
      }
    }
    const [table] = tablesOf(toReaderBlocks(page));
    expect(table.headerRows).toBe(2);
    expect(table.trends).toBeUndefined();

    // A `+` value in cyan says two things at once: left plain.
    const line = classify(load(176)!)[0].lines.find((l) => l.number === 8)!;
    expect(trendMarks(line)).toHaveLength(1);
    const odd = structuredClone(line);
    odd.line.runs.at(-1)!.fg = 'cyan';
    expect(trendMarks(odd)).toEqual([]);
    odd.line.runs.at(-1)!.fg = 'white';
    expect(trendMarks(odd)).toEqual([]);
  });
});

describe('blocks: graphics cells sent as plain text (RP.8)', () => {
  it('891 reads as the header line, the sunrise table, the greeting and the link, with no mosaic', () => {
    const bs = blocks(891);
    expect(bs.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph', 'linkList']);
    expect(paragraphs(bs)[0]).toBe('ON SUNNUNTAI 25.10.2026 KESÄAIKA PÄÄTTYY');
    // Exactly Yle's words and columns (licence: no rewording).
    expect((bs[1] as TableBlock).lines).toEqual([
      'AURINKO   NOUSEE LASKEE',
      'Helsinki   7.25   16.43',
      'Jyväskylä  7.29   16.32',
      'Oulu       7.43   16.20',
      'Sodankylä  7.52   16.02',
      'Utsjoki    8.07   15.43',
    ]);
    const shown = JSON.stringify(bs);
    for (const junk of ['82 w', '(h+ q', 'bs,bupuu', '*!} tw', '07 bz', 'uj4', '\x7f']) {
      expect(shown).not.toContain(junk);
    }
  });

  it('890, 700 and 799 show their titles without the logo next to them', () => {
    expect(paragraphs(blocks(890))[0]).toBe('KALENTERI');
    expect(blocks(700)[0]).toEqual({ kind: 'title', text: 'svenska.yle.fi' });
    expect(blocks(799)[0]).toEqual({ kind: 'title', text: 'PÅ SVENSKA:' });
  });
});

describe('blocks: index entries with the name first (RP.7)', () => {
  /** Headings and list entries of subpage `sp`: `# A`, `Aamu-tv:n aiheet 399`, `DIGITA tiedottaa 577 582 588`. */
  const outline = (n: number, sp: number) =>
    subpage(n, sp).flatMap((b): string[] => {
      if (b.kind === 'heading') return [`# ${b.text}`];
      if (b.kind === 'title') return [`title ${b.text}`];
      if (b.kind === 'paragraph') return [`text ${plain(b)}`];
      if (b.kind !== 'linkList') return [];
      return b.entries.map((e) =>
        [
          b.variant === 'bar' ? 'bar' : '',
          e.label,
          e.linkText,
          ...(e.more ?? []).map((m) => m.text),
        ]
          .filter((s) => s !== '')
          .join(' '),
      );
    });
  const entry = (n: number, label: string): LinkEntry | undefined =>
    lists(blocks(n))
      .flatMap((l) => l.entries)
      .find((e) => e.label === label);

  it('196/1: one entry per row, the letters as headings, the title on top', () => {
    expect(outline(196, 1)).toEqual([
      'title AAKKOSELLINEN HAKEMISTO',
      '# A',
      'Aamu-tv:n aiheet 399',
      'Aikataulut 400',
      'Ajankohtaisohjelmien aiheet 356',
      'Ajatus päivälle 895',
      'Alueuutiset 500',
      'Arkistopikseleiden paluu 806',
      'Aurinko nousee 891',
      'Areena 386-395',
      'Arkisto, teksti-tv:n 897',
      'Ava tänään 306',
      '# C',
      'Chabla-palvelu,viittomakielinen 566',
      '# D',
      'Digineuvonta 589',
      'DIGITA tiedottaa 577 582 588',
      'Digitreenit 851-857',
      'DX-kuuntelijoiden sivut 591',
      'bar Svenska sidor index 799',
    ]);
  });

  it('the counter: subpages 2/3 and 3/3 are marked, the title is shown once (196)', () => {
    expect(dividers(196).map((d) => `${d.number}/${d.count}`)).toEqual(['2/3', '3/3']);
    expect(blocks(196).filter((b) => b.kind === 'title')).toEqual([
      { kind: 'title', text: 'AAKKOSELLINEN HAKEMISTO' },
    ]);
    expect(dividers(198).map((d) => `${d.number}/${d.count}`)).toEqual(['2/4', '3/4', '4/4']);
  });

  it('every page number is a link: one per number, a range opens its first page', () => {
    expect(entry(196, 'Areena')).toEqual({
      label: 'Areena',
      target: range(386, 395),
      linkText: '386-395',
    });
    expect(entry(196, 'DIGITA tiedottaa')).toEqual({
      label: 'DIGITA tiedottaa',
      target: page(577),
      linkText: '577',
      more: [
        { text: '582', target: page(582) },
        { text: '588', target: page(588) },
      ],
    });
    expect(entry(197, 'Radioamatöörit')?.more).toEqual([
      { text: '595-596', target: range(595, 596) },
    ]);
    // No 3-digit number is left in a name or as text on the three pages.
    for (const n of [196, 197, 198]) {
      for (const e of lists(blocks(n)).flatMap((l) => l.entries)) {
        expect(e.label, `${n}: ${e.label}`).not.toMatch(/\d{3}/);
      }
      expect(paragraphs(blocks(n)).join(' '), String(n)).not.toMatch(/\d{3}/);
    }
  });

  it('a list that goes on in the next row stays one entry (196/2, 198/4)', () => {
    const fem = ['305', '312', '317', '359-360', '774-776'];
    expect(outline(196, 2)).toContain(`Fem, Yle Teema & Fem ${fem.join(' ')}`);
    expect(outline(198, 4)).toContain(`Yle Teema & Fem ${fem.join(' ')}`);
    expect(entry(198, 'Yle Teema & Fem')?.more?.at(-1)).toEqual({
      text: '774-776',
      target: range(774, 776),
    });
  });

  it('a row with two names gives two entries; a note joins its name (197, 196, 198)', () => {
    expect(outline(197, 3)).toEqual(
      expect.arrayContaining([
        'Säätiedotus 401',
        '5 vrk ennuste 405',
        'Sää paikkakunnittain: tänään 406',
        '3 vrk 407',
        'selitteet 419',
        'Sää,jalankulkusää (marras-huhtikuu) 418',
        'Sää,liikennesää 410',
      ]),
    );
    expect(outline(196, 3)).toEqual(
      expect.arrayContaining(['Lintutilanne 888', 'Lista 804', '"Kirkasvalosivu" 579']),
    );
    expect(outline(198, 3)).toEqual(
      expect.arrayContaining(['Uutiset: kotimaa 102', 'ulkomaat 130', 'Valkoinen sivu 579']),
    );
  });

  it('a note wrapped into the next row joins its entry, not the next one (197/2)', () => {
    expect(outline(197, 2).slice(-3)).toEqual([
      'Rinne- ja latutiedot (loka-toukokuu) 420',
      'Ruokavihje 811',
      'bar Säteilyturvasivu 867',
    ]);
  });

  it('no entry runs over a subpage break; each subpage starts with its letter (197, 198)', () => {
    // 197/1 ends with P and 197/2 starts with P: Yle draws the P again, so does the reader.
    expect(outline(197, 1).slice(-3)).toEqual([
      'Pitkäveto 490-491',
      'Prime-korot 172',
      'bar Säteilyturvasivu 867',
    ]);
    expect(outline(197, 2).slice(0, 2)).toEqual(['# P', 'Puolustusvoimien ammunnat 592']);
    expect(outline(198, 2).slice(0, 2)).toEqual(['# T', 'Turvasivut 860']);
    // 197/3 starts with the Saami entries in lower case: they take the S.
    expect(dividers(197)[1].titles).toEqual(['Saamenkieliset uutiset:']);
    expect(outline(197, 3).slice(0, 4)).toEqual([
      '# S',
      'pohjoissaami 520',
      'inarinsaami 521',
      'Shakki 809',
    ]);
  });

  it('a row without a number stays text; no number is guessed (198/3)', () => {
    expect(outline(198, 3).slice(-4)).toEqual([
      'Viking Lotto 472',
      'text Viranomaistiedotteet >',
      'Väderindex 760',
      'bar Viikkomakasiinin uusimmat 801',
    ]);
  });

  it('letter headings only on 196-198, and off with the option', () => {
    expect([...LETTER_HEADING_PAGES]).toEqual([196, 197, 198]);
    const headings = (bs: ReaderBlock[]) => bs.filter((b) => b.kind === 'heading').length;
    expect(headings(blocks(196))).toBe(10);
    const p = load(196)!;
    expect(headings(toReaderBlocks(p, classify(p), { letterHeadings: false }))).toBe(0);
    // Same entries with or without them.
    expect(entries(toReaderBlocks(p, classify(p), { letterHeadings: false }))).toEqual(
      entries(blocks(196)),
    );
  });
});

describe('blocks: 400 Puolustusvoimien ampumatiedotteet (RP.7)', () => {
  it('is the last row of the page list with its number, not a separate chip', () => {
    const ls = lists(blocks(400));
    expect(ls.map((l) => l.variant)).toEqual(['list']);
    expect(ls[0].entries.at(-1)).toEqual({
      label: 'Puolustusvoimien ampumatiedotteet',
      target: page(592),
      linkText: '592',
    });
    // RP.3: RAVIT and VEIKKAUSSIVUT stay out.
    const texts = entries(blocks(400)).map(([t]) => t);
    expect(texts).not.toContain('460');
    expect(texts).not.toContain('470');
  });
});

describe('blocks: tables', () => {
  it('keeps stock quotes in one table: digits inside numbers are not links (174)', () => {
    const t = subpage(174, 1).filter((b): b is TableBlock => b.kind === 'table');
    expect(t).toHaveLength(1);
    expect(t[0].lines).toHaveLength(20);
    expect(t[0].lines[0]).toBe('Nikkei           : -439,32 =   -0,70');
    expect(t[0].lines[1]).toBe('23.10. 09:25     62 734,60 pistettä');
    expect(lists(subpage(174, 1))).toEqual([]);
  });

  it('reads airport boards as one table per subpage, with no links in it (425-427)', () => {
    // Yle marks flight-number digits (BT358) and the number at the row's end (200) as links.
    // The one link is the footer `HELSINKI-VANTAA s. 426-427` (page-ref), shown once.
    const t425 = subpage(425, 1).filter((b): b is TableBlock => b.kind === 'table');
    expect(t425).toHaveLength(1);
    expect(t425[0].lines).toEqual([
      '05:25 Riika      BT358',
      '06:00 Helsinki   AY270',
      '12:20 Helsinki   AY644',
      '15:30 Riika      BT356',
    ]);
    expect(entries(subpage(425, 1))).toEqual([['426-427', 'HELSINKI-VANTAA']]);
    for (const [n, sp] of [
      [425, 3],
      [426, 1],
      [426, 3],
      [427, 1],
      [427, 4],
    ] as const) {
      expect(lists(subpage(n, sp))).toEqual([]);
    }
    const t426 = subpage(426, 1).filter((b): b is TableBlock => b.kind === 'table');
    expect(t426).toHaveLength(1);
    expect(t426[0].lines[0]).toBe('16:10 Mancheste AY1365 Sulj       200');
    expect(t426[0].lines).toHaveLength(21);
    const t427 = subpage(427, 1).filter((b): b is TableBlock => b.kind === 'table');
    expect(t427).toHaveLength(1);
    expect(t427[0].lines[0]).toBe('15:00 Riika      AY1074 Arvioit 19:56');
  });

  it('names each airport board and shows the shared footer once (425)', () => {
    const bs = blocks(425);
    // Row 1 names the airport: one title above subpage 1, then in the divider where it changes.
    expect(bs.slice(0, 2)).toEqual([
      { kind: 'title', text: 'TAMPERE-PIRKKALA' },
      { kind: 'title', text: 'Lähtevät/Departures' },
    ]);
    expect(dividers(425).map((d) => d.titles)).toEqual([
      ['Saapuvat/Arrivals'],
      ['TURKU', 'Lähtevät/Departures'],
      ['Saapuvat/Arrivals'],
      ['OULU', 'Lähtevät/Departures'],
      ['Saapuvat/Arrivals'],
    ]);
    // The "Turku >>>" / "Oulu >>>" arrows are not read out.
    expect(allText(bs)).not.toContain('>>>');
    expect(paragraphs(bs).filter((t) => /^(Turku|Oulu)$/.test(t))).toEqual([]);
    // The Helsinki-Vantaa footer closes subpages 1, 3 and 5: shown under subpage 1 only.
    const footers = (n: number) => paragraphs(subpage(425, n)).filter((t) => t.includes('finavia'));
    expect(footers(1)).toHaveLength(1);
    expect(footers(3)).toEqual([]);
    expect(footers(5)).toEqual([]);
    // Sports tables whose name changes between subpages get the same (237).
    expect(blocks(237)[0]).toEqual({ kind: 'title', text: 'NHL/ITÄ (84 OTTELUA)' });
    expect(dividers(237).map((d) => d.titles)).toEqual([
      ['NHL/LÄNSI (84 OTTELUA)'],
      ['NHL-JÄÄKIEKKO'],
    ]);
    // An article's header row is not a board name (725: the weekday).
    expect(dividers(725).every((d) => d.titles.length === 0)).toBe(true);
  });

  it('keeps consecutive table rows verbatim as one block, minus shared indent (402 sp1)', () => {
    const page402 = load(402);
    if (!page402) throw new Error('402');
    const rows = classify(page402)[0].lines.filter((l) => l.kind === 'table');
    const t = subpage(402, 1).filter((b): b is TableBlock => b.kind === 'table');
    expect(t).toHaveLength(1);
    // Every row starts at column 1 on screen; the shared indent is removed.
    expect(t[0].lines).toEqual(rows.map((r) => r.text.slice(1).trimEnd()));
    expect(t[0].lines[1]).toBe('Hki-Vantaa      9   E  4 SELKEÄÄ');
  });

  it('keeps TV-guide continuation rows inside the table (301)', () => {
    const t = subpage(301, 1).find((b): b is TableBlock => b.kind === 'table');
    expect(t?.lines.slice(0, 2)).toEqual([
      '22.50 Ruotsalainen paloittelumurha (12)',
      '      A >352',
    ]);
  });

  it('keeps bracketed notes inside the table, not as paragraphs (235)', () => {
    expect(paragraphs(blocks(235))).toEqual([]);
    const t = subpage(235, 1).filter((b): b is TableBlock => b.kind === 'table');
    expect(t[0].lines).toEqual([
      'Pittsburgh     - Florida           4-0',
      'Robertson     15',
      'Lapierre      29',
      '(Koivunen)',
      'Malkin        41',
      'Robertson     57',
    ]);
  });

  it('removes only indent shared by every row (406 header row stays indented)', () => {
    const t = blocks(406).find((b): b is TableBlock => b.kind === 'table');
    expect(t?.lines[0]).toBe('            klo 18    klo 00    klo 06');
    expect(t?.lines[1]).toBe('Helsinki  +11se  E5 +10se SE5 +10se SE5');
  });

  it('puts a column header in the table so its columns line up (298/2 Voittaja, Bottas)', () => {
    const t = subpage(298, 2).filter((b): b is TableBlock => b.kind === 'table');
    expect(paragraphs(subpage(298, 2))).toEqual([]);
    expect(t).toHaveLength(1);
    // Rows stay in Yle's columns (shared indent removed); single blank rows are kept.
    expect(t[0].lines.slice(0, 5)).toEqual([
      '               Voittaja    Bottas',
      '',
      'Australia      Russell     kesk.',
      'Kiina          Antonelli   13.',
      '',
    ]);
    const column = (line: string, word: string) => line.indexOf(word);
    expect(column(t[0].lines[0], 'Voittaja')).toBe(column(t[0].lines[2], 'Russell'));
    expect(column(t[0].lines[0], 'Bottas')).toBe(column(t[0].lines[2], 'kesk.'));
    expect(t[0].lines.at(-1)).not.toBe('');
  });

  it('aligns the header on the last subpage too, where Bottas has no value (298/4)', () => {
    const t = subpage(298, 4).filter((b): b is TableBlock => b.kind === 'table');
    expect(t).toHaveLength(1);
    expect(t[0].lines).toEqual(['               Voittaja    Bottas', '', 'Abu Dhabi      06.12.']);
  });
});

describe('blocks: headerName (the name in row 1)', () => {
  const name = (n: number) => {
    const p = load(n);
    if (!p) throw new Error(`${n}`);
    return headerName(classify(p)[0]);
  };

  it('takes the header row without the subpage counter and date (235, 250, 230)', () => {
    expect(name(235)).toBe('NHL-JÄÄKIEKKO'); // `NHL-JÄÄKIEKKO   23.10.  1/5`
    expect(name(250)).toBe('JALKAPALLO T18 SM'); // `T18 SM` kept: a capital-letter code
    expect(name(230)).toBe('JÄÄKIEKKO U20 SM-SARJA');
  });

  it('leaves out graphics before the name and the masthead (406, 103)', () => {
    expect(name(406)).toBe('Ilmatieteen laitos: sää tänään');
    expect(name(103)).toBe('KOTIMAA KESKIVIIKKO'); // `KOTIMAA   YLE  KESKIVIIKKO`
  });

  it('gives nothing for a header of mosaic art or no subpage (101)', () => {
    expect(name(101)).toBeUndefined();
    expect(headerName(undefined)).toBeUndefined();
  });
});

describe('blocks: subpages and titles', () => {
  it('joins subpages with a divider before each later subpage (725)', () => {
    expect(dividers(725)).toEqual([
      { kind: 'subpageDivider', number: 2, count: 3, titles: [] },
      { kind: 'subpageDivider', number: 3, count: 3, titles: [] },
    ]);
    expect(blocks(725)[0].kind).toBe('paragraph');
  });

  it('labels dividers with the subpage title (301 TV-guide day)', () => {
    expect(blocks(301)[0]).toEqual({ kind: 'title', text: 'TV1 Keskiviikko 21.10.' });
    expect(dividers(301).map((d) => d.titles)).toEqual([
      ['TV1 Torstai 22.10.'],
      ['TV1 Torstai 22.10.'],
    ]);
  });

  it('drops the subpage counter from titles (402 "… klo 20  1/3")', () => {
    expect(blocks(402)[0]).toEqual({ kind: 'title', text: 'Sää maa-asemilla 21.10. klo 20' });
    expect(dividers(402).map((d) => d.titles)).toEqual([
      ['Sää maa-asemilla 21.10. klo 20'],
      ['Lämpötiloja ulkomailla 21.10.', 'Klo 15 Suomen aikaa'],
    ]);
  });

  it('shows a title found on every subpage once at the top (403 weather issue time)', () => {
    expect(blocks(403).slice(0, 2)).toEqual([
      { kind: 'title', text: 'Ilmatieteen laitos 21.10.' },
      { kind: 'title', text: 'Merisääennuste klo 21.00' },
    ]);
    expect(dividers(403).every((d) => d.titles.length === 0)).toBe(true);
    expect(blocks(403).filter((b) => b.kind === 'title')).toHaveLength(2);
  });

  it('skips titles that only repeat the masthead or page name (100, 101, 175)', () => {
    expect(blocks(100).some((b) => b.kind === 'title')).toBe(false);
    expect(blocks(101).some((b) => b.kind === 'title')).toBe(false);
    // "P Ö R S S I S I V U T" on page "Pörssisivut".
    expect(blocks(175).some((b) => b.kind === 'title')).toBe(false);
  });

  it('keeps a single-subpage page title as a title block (405)', () => {
    expect(blocks(405).slice(0, 2)).toEqual([
      { kind: 'title', text: 'Ilmatieteen laitos' },
      { kind: 'title', text: 'Viiden vrk:n sää 22.-26.10.' },
    ]);
  });
});

describe('blocks: rows repeated on every subpage', () => {
  function repeated(n: number): number[] {
    const p = load(n);
    if (!p) throw new Error(`fixture ${n} does not normalise`);
    return [...repeatedRows(classify(p))].sort((a, b) => a - b);
  }

  it("shows 100's masthead links and headlines once, on subpage 1", () => {
    // Rows 4 (yle.fi/tekstitv, 199) and 6–15 (five headlines) are the same on
    // all 4 subpages; only the section bar (rows 18–23) changes.
    expect(repeated(100)).toEqual([4, 6, 9, 11, 13, 15]);
    const first = lists(subpage(100, 1));
    expect(first.map((l) => l.variant)).toEqual(['bar', 'list', 'bar']);
    expect(first[1].entries.map((e) => e.linkText)).toEqual(['136', '110', '109', '111', '205']);
    expect(entries(blocks(100)).filter(([link]) => link === '136')).toHaveLength(1);
    expect(entries(blocks(100)).filter(([link]) => link === 'yle.fi/tekstitv')).toHaveLength(1);
  });

  it('keeps each later subpage of 100 to its own section bar', () => {
    for (const sp of [2, 3, 4]) {
      const bs = subpage(100, sp);
      expect(
        bs.map((b) => b.kind),
        `sp${sp}`,
      ).toEqual(['linkList']);
      expect(lists(bs)[0].variant).toBe('bar');
    }
    expect(entries(subpage(100, 2))[0]).toEqual(['331', 'TEKSTITYS']);
    // Rows 18–21 match subpage 1 here, but not on every subpage: kept.
    expect(entries(subpage(100, 3))[0]).toEqual(['101', 'UUTISET']);
    expect(entries(subpage(100, 4)).at(-1)).toEqual(['809', 'Shakki: Viikon peli']);
  });

  it('shows 199 once: only the title repeats, and it is already shown once', () => {
    // Every 199 subpage has its own index rows. The header row (`1/4`) is
    // dropped by classify and "Päähakemistojen kooste" is a common title.
    expect(repeated(199)).toEqual([]);
    expect(blocks(199).filter((b) => b.kind === 'title')).toEqual([
      { kind: 'title', text: 'Päähakemistojen kooste' },
    ]);
    // The bottom bar repeats on some subpages only (2 and 3; 4 adds "s."), so it stays.
    for (const sp of [2, 3, 4]) {
      expect(entries(subpage(199, sp)).at(-1)?.[0], `sp${sp}`).toBe('196-198');
    }
  });

  it('never drops table rows: each 408 table keeps its column header', () => {
    // Row 2 (issue time + legend link) is a link row on every subpage: once.
    // Row 3 (`klo 15  TO  PE  LA`) is a table row on every subpage: kept.
    expect(repeated(408)).toEqual([2]);
    const tables = blocks(408).filter((b): b is TableBlock => b.kind === 'table');
    expect(tables).toHaveLength(3);
    for (const t of tables) expect(t.lines[0]).toMatch(/^ +klo 15 +TO +PE +LA$/);
    expect(lists(blocks(408))).toHaveLength(1);
  });

  it('keeps rows that repeat on some subpages only (417, 44 road notices)', () => {
    // "Puh: 02002100" and the traffic centre e-mails recur on many, not all.
    expect(repeated(417)).toEqual([]);
    const phone = paragraphs(blocks(417)).filter((p) => p.includes('Puh: 02002100'));
    expect(phone.length).toBeGreaterThan(10);
  });

  it('keeps a shared footer link once, at the end of subpage 1 (410, 725)', () => {
    expect(repeated(410)).toEqual([23]);
    expect(repeated(725)).toEqual([23]);
    expect(entries(blocks(725))).toEqual([['svenska.yle.fi/huvudstadsregionen', '']]);
    expect(entries(subpage(725, 1))).toEqual([['svenska.yle.fi/huvudstadsregionen', '']]);
  });
});

describe('blocks: contact lines', () => {
  function contact(bs: ReaderBlock[]): ContactBlock | undefined {
    return bs.find((b): b is ContactBlock => b.kind === 'contact');
  }
  /** Contact lines as plain text; links shown as `[text]`. */
  function contactText(b: ContactBlock | undefined): string[] {
    return (b?.lines ?? []).map((l) =>
      l.map((s) => (s.kind === 'link' ? `[${s.text}]` : s.text)).join(''),
    );
  }

  it("finds Yle's address, e-mail, phone and web rows on 101", () => {
    expect([...contactRows(classify(load(101)!)[0])]).toEqual([11, 12, 13, 14]);
  });

  it('moves them to one block at the end, wording kept and spaces tidied (101)', () => {
    const bs = blocks(101);
    expect(bs.at(-1)?.kind).toBe('contact');
    expect(contactText(contact(bs))).toEqual([
      'Yle Uutiset PL 24, 00024 YLE',
      'sähköposti [yle.uutiset@yle.fi]',
      'puhelin 09-14801 fax 09-1480 3455',
      '[yle.fi/uutiset]',
    ]);
    // E-mail and web stay tappable.
    expect(contact(bs)?.lines[1][1]).toMatchObject({
      target: { kind: 'url', href: 'mailto:yle.uutiset@yle.fi' },
    });
    // Nothing of it is left in the body.
    expect(allText(bs)).not.toMatch(/PL 24|puhelin|sähköposti/);
    expect(entries(bs).map(([text]) => text)).not.toContain('yle.fi/uutiset');
  });

  it('finds them on 799 too (Swedish, "PB 5", "nyheter(a)yle.fi")', () => {
    expect([...contactRows(classify(load(799)!)[0])]).toEqual([21, 22]);
    const bs = blocks(799);
    expect(bs.at(-1)?.kind).toBe('contact');
    expect(contactText(contact(bs))).toEqual([
      'TEXT-TV, PB 5, 00024 RUNDRADION',
      'E-postadress: nyheter(a)yle.fi',
    ]);
  });

  it('leaves contact details on text pages alone (417 "Puh:" and "Sähköposti:")', () => {
    for (const sp of classify(load(417)!)) expect(contactRows(sp).size).toBe(0);
    expect(contact(blocks(417))).toBeUndefined();
    expect(paragraphs(subpage(417, 1))).toContain(
      'Fintraffic Tieliikennekeskus\nPuh: 02002100\nSähköposti:',
    );
  });

  it('needs both an e-mail and a phone or postal address (575 "puhelinpalvelut, s-posti")', () => {
    for (const sp of classify(load(575)!)) expect(contactRows(sp).size).toBe(0);
  });

  it('finds contact lines on no other fixture', () => {
    const found = readdirSync(pagesDir)
      .map((f) => load(f.replace('.json', '')))
      .filter((p): p is Page => p !== undefined)
      .filter((p) => classify(p).some((sp) => contactRows(sp).size > 0))
      .map((p) => p.number);
    expect(found).toEqual([101, 799]);
  });
});

describe('blocks: sorted link lists (101)', () => {
  it('shows every page link of 101 as one list in page-number order', () => {
    const ls = lists(blocks(101)).filter((l) => l.variant === 'list');
    expect(ls).toHaveLength(1);
    expect(ls[0].entries.map((e) => [e.linkText, e.label])).toEqual([
      ['100', 'ETUSIVU'],
      ['102', 'Kotimaa'],
      ['112', 'Vaaratiedotteet'],
      ['130', 'Ulkomaat'],
      ['160', 'Talous'],
      ['175', 'Pörssisivut'],
      ['190', 'News in English'],
      ['201', 'Urheilu'],
      ['220', 'Palloilusarjat'],
      ['300', 'TV- ja radio-ohjelmatiedot'],
      ['400', 'Sää ja liikenne, Veikkaus'],
      ['500', 'Alueuutiset'],
      ['500', 'Alueuutiset, tv-tekniikka'],
      ['599', 'Teksti-TV:n yhteystiedot'],
      ['700', 'Text-TV på svenska'],
      ['800', 'Viikkomakasiini'],
      ['866', 'Vaaratiedoteinfo'],
      ['867', 'Säteilyturva'],
    ]);
  });

  it('keeps every entry and word: only the order changes (101)', () => {
    const p = load(101)!;
    const key = (e: LinkEntry) => `${e.linkText} ${e.label}`;
    const unsorted = toReaderBlocks(p, undefined, { sortLinks: false });
    const sorted = toReaderBlocks(p);
    expect(
      entries(sorted)
        .map(([a, b]) => `${a} ${b}`)
        .sort(),
    ).toEqual(
      lists(unsorted)
        .flatMap((l) => l.entries)
        .map(key)
        .sort(),
    );
    expect(paragraphs(sorted)).toEqual(paragraphs(unsorted));
  });

  it('puts the loose label first, then the list, the bar and the contact lines (101)', () => {
    expect(
      blocks(101).map((b) => (b.kind === 'linkList' ? `${b.kind}:${b.variant}` : b.kind)),
    ).toEqual(['paragraph', 'linkList:list', 'linkList:bar', 'contact']);
    expect(paragraphs(blocks(101))).toEqual(['UUTISET']);
  });

  it('is only on for the pages listed, so other index pages keep Yle order (199, 575, 799; 200 only moves its bar)', () => {
    expect([...SORTED_LINK_PAGES]).toEqual([101]);
    for (const n of [100, 199, 575, 799]) {
      const p = load(n)!;
      expect(toReaderBlocks(p), String(n)).toEqual(
        toReaderBlocks(p, undefined, { sortLinks: false }),
      );
    }
    // Yle's own column order is kept, e.g. 200 reads across: 223, 263, 226…
    expect(
      entries(blocks(200).filter((b) => b.kind === 'linkList' && b.variant === 'list'))
        .slice(0, 3)
        .map(([t]) => t),
    ).toEqual(['223', '263', '226']);
  });

  it('sorts ranges by their first page, web links last, ties in page order', () => {
    const e = (linkText: string, target: ReaderLink): LinkEntry => ({
      label: linkText,
      target,
      linkText,
    });
    const sorted = sortLinkLists([
      {
        kind: 'linkList',
        variant: 'list',
        entries: [e('500', page(500)), e('web', { kind: 'url', href: 'https://yle.fi' })],
      },
      { kind: 'paragraph', segments: [{ kind: 'text', text: 'UUTISET' }] },
      {
        kind: 'linkList',
        variant: 'list',
        entries: [e('406-408', range(406, 408)), e('500b', page(500))],
      },
      { kind: 'linkList', variant: 'bar', entries: [e('196', page(196))] },
      { kind: 'subpageDivider', number: 2, count: 2, titles: [] },
      { kind: 'linkList', variant: 'list', entries: [e('302', page(302)), e('301', page(301))] },
    ]);
    expect(
      sorted.map((b) =>
        b.kind === 'linkList' ? b.entries.map((x) => x.linkText).join(',') : b.kind,
      ),
    ).toEqual(['paragraph', '406-408,500,500b,web', '196', 'subpageDivider', '301,302']);
  });
});

describe('blocks: every fixture', () => {
  const files = readdirSync(pagesDir).filter((f) => f.endsWith('.json'));
  const pages = files
    .map((f) => ({ name: f, page: load(f.replace('.json', '')) }))
    .filter((p): p is { name: string; page: Page } => p.page !== undefined);

  it('drops repeated rows and footers only on multi-subpage pages that repeat them', () => {
    const changed: number[] = [];
    for (const { name, page: p } of pages) {
      const sps = classify(p);
      const before = toReaderBlocks(p, sps, { keepRepeatedRows: true });
      const after = toReaderBlocks(p, sps);
      if (p.subpages.length === 1) {
        // Single-subpage pages: exactly the same blocks as without the rule.
        expect(repeatedRows(sps).size, name).toBe(0);
        expect(after, name).toEqual(before);
      } else if (JSON.stringify(after) !== JSON.stringify(before)) {
        changed.push(p.number);
      }
    }
    // 425 closes three boards with the same two lines (repeated footers); 189
    // closes subpages 3 and 4 like 2 and 1 once their next-subpage hints are gone;
    // 176 closes every subpage with the index line `OMXH 12 904,31 ( -0,34 )`.
    expect(changed.sort((a, b) => a - b)).toEqual([100, 176, 189, 408, 410, 425, 725]);
  });

  it('converts every fixture page without throwing and without empty blocks', () => {
    expect(pages.length).toBeGreaterThan(50);
    for (const { name, page: p } of pages) {
      const bs = toReaderBlocks(p);
      expect(bs.length, name).toBeGreaterThan(0);
      for (const b of bs) {
        if (b.kind === 'paragraph') {
          expect(b.segments.length, name).toBeGreaterThan(0);
          expect(plain(b).trim(), name).not.toBe('');
        }
        if (b.kind === 'heading' || b.kind === 'title') expect(b.text.trim(), name).not.toBe('');
        if (b.kind === 'linkList') expect(b.entries.length, name).toBeGreaterThan(0);
        if (b.kind === 'table') expect(b.lines.length, name).toBeGreaterThan(0);
      }
      const dividers = bs.filter((b) => b.kind === 'subpageDivider');
      expect(dividers, name).toHaveLength(p.subpages.length - 1);
    }
  });

  it("never changes Yle's wording on text-only pages: same letters and digits in order", () => {
    const strip = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '');
    let checked = 0;
    for (const { name, page: p } of pages) {
      const rows = classify(p).flatMap((sp) => sp.lines);
      const textOnly = rows.every((l) =>
        ['drop', 'blank', 'heading', 'paragraph'].includes(l.kind),
      );
      if (!textOnly) continue;
      checked++;
      const input = rows
        .filter((l) => l.kind === 'heading' || l.kind === 'paragraph')
        .map((l) => l.text)
        .join('');
      const output = toReaderBlocks(p)
        .map((b) => (b.kind === 'heading' ? b.text : b.kind === 'paragraph' ? plain(b) : ''))
        .join('')
        .replace(/[[\]]/g, '');
      expect(strip(output), name).toBe(strip(input));
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  it('keeps every letter and digit exactly once on every fixture (unordered counts)', () => {
    // Labels can move before or after their link number, so only counts are
    // compared. Title rows are left out on both sides: by design they are
    // de-duplicated across subpages, lose the `1/3` counter and skip the
    // masthead (tested in "blocks: subpages and titles"). Link rows repeated
    // on every subpage count once, on subpage 1 ("blocks: rows repeated…").
    // On link rows a page reference's page word is left out (`Keskihinnat
    // s.188` → the link `Keskihinnat`, "blocks: page references"). The letter
    // headings of 196-198 come from graphics, not text, so they are turned off
    // here ("blocks: index entries with the name first").
    const withoutPageWords = (l: ClassifiedLine) => {
      if (l.kind !== 'nav' && l.kind !== 'headline') return l.text;
      let t = l.text;
      for (const k of [...l.links].reverse()) {
        if (!k.pageRef) continue;
        const head = t.slice(0, k.column);
        t = head.slice(0, head.lastIndexOf(k.label) + k.label.length) + ' ' + t.slice(k.column);
      }
      return t;
    };
    const count = (s: string) => {
      const m = new Map<string, number>();
      for (const ch of s.replace(/[^\p{L}\p{N}]/gu, '')) m.set(ch, (m.get(ch) ?? 0) + 1);
      return m;
    };
    const diff = (a: Map<string, number>, b: Map<string, number>) => {
      const out: Record<string, number> = {};
      for (const ch of new Set([...a.keys(), ...b.keys()])) {
        const d = (b.get(ch) ?? 0) - (a.get(ch) ?? 0);
        if (d !== 0) out[ch] = d;
      }
      return out;
    };
    for (const { name, page: p } of pages) {
      const sps = classify(p);
      const shown = repeatedRows(sps);
      const footers = repeatedFooters(sps);
      const input = sps
        .flatMap((sp, i) =>
          sp.lines.filter(
            (l) => (i === 0 || !shown.has(l.number)) && !footers.get(i)?.has(l.number),
          ),
        )
        .filter((l) => l.kind !== 'drop' && l.kind !== 'title')
        .map(withoutPageWords)
        .join(' ');
      const output = toReaderBlocks(p, sps, { hideLinks: false, letterHeadings: false })
        .map((b) => {
          switch (b.kind) {
            case 'heading':
              return b.text;
            case 'paragraph':
              return plain(b);
            case 'table':
              return b.lines.join(' ');
            case 'linkList':
              return b.entries
                .map((e) => [e.linkText, ...(e.more ?? []).map((m) => m.text), e.label].join(' '))
                .join(' ');
            case 'contact':
              return b.lines.map((l) => l.map((s) => s.text).join('')).join(' ');
            default:
              return '';
          }
        })
        .join(' ');
      expect(diff(count(input), count(output)), name).toEqual({});
    }
  });
});

describe('blocks: hidden entries (400)', () => {
  it('leaves RAVIT 460 and VEIKKAUSSIVUT 470 out of the Sää ja liikenne list', () => {
    expect([...(HIDDEN_LINK_PAGES.get(400) ?? [])]).toEqual([460, 470]);
    const texts = entries(blocks(400)).map(([t]) => t);
    expect(texts).not.toContain('460');
    expect(texts).not.toContain('470');
    expect(allText(blocks(400))).not.toMatch(/RAVIT|VEIKKAUS/);
    // The weather and traffic entries around them stay.
    expect(texts).toContain('428-429');
    expect(texts).toContain('401');
  });

  it('shows them when the rule is off, and touches no other page', () => {
    const p = load(400)!;
    const all = entries(toReaderBlocks(p, classify(p), { hideLinks: false })).map(([t]) => t);
    expect(all).toEqual(expect.arrayContaining(['460', '470']));
    expect(entries(blocks(400)).length).toBe(all.length - 2);
    for (const n of [100, 190, 199, 300, 401]) {
      const q = load(n)!;
      expect(toReaderBlocks(q, classify(q), { hideLinks: false })).toEqual(toReaderBlocks(q));
    }
  });

  it('drops a list that becomes empty and keeps other blocks and lists', () => {
    const only: ReaderBlock = {
      kind: 'linkList',
      variant: 'list',
      entries: [{ label: 'RAVIT', target: page(460), linkText: '460' }],
    };
    const keep: ReaderBlock = {
      kind: 'linkList',
      variant: 'list',
      entries: [{ label: 'Sää', target: page(401), linkText: '401' }],
    };
    const title: ReaderBlock = { kind: 'title', text: 'X' };
    expect(withoutLinks([title, only, keep], new Set([460]))).toEqual([title, keep]);
  });
});

describe('blocks: bar first (200)', () => {
  it('puts the UUTISET and PALLOILU buttons above the leagues, which keep their order', () => {
    expect([...BAR_FIRST_PAGES]).toEqual([200]);
    const kinds = blocks(200).map((b) => (b.kind === 'linkList' ? `${b.variant}` : b.kind));
    expect(kinds).toEqual(['bar', 'list']);
    expect(entries(blocks(200).slice(0, 1))).toEqual([
      ['201', 'UUTISET'],
      ['220', 'PALLOILU'],
    ]);
    expect(
      entries(blocks(200).slice(1))
        .slice(0, 3)
        .map(([t]) => t),
    ).toEqual(['223', '263', '226']);
  });

  it('moves bars on each subpage, after a title, without touching other blocks', () => {
    const list: LinkListBlock = { kind: 'linkList', variant: 'list', entries: [] };
    const bar: LinkListBlock = { kind: 'linkList', variant: 'bar', entries: [] };
    const title: ReaderBlock = { kind: 'title', text: 'X' };
    const divider: ReaderBlock = { kind: 'subpageDivider', number: 2, count: 2, titles: [] };
    expect(barsFirst([title, list, bar, divider, list, bar])).toEqual([
      title,
      bar,
      list,
      divider,
      bar,
      list,
    ]);
  });
});

describe('blocks: column pages (300)', () => {
  /** Block stream as short strings: `# heading`, `p text`, `list: 301 TV1, …`. */
  const outline = (bs: ReaderBlock[]) =>
    bs.map((b) =>
      b.kind === 'heading'
        ? `# ${b.text}`
        : b.kind === 'linkList'
          ? `${b.variant}: ${b.entries.map((e) => `${e.linkText} ${e.label}`).join(', ')}`
          : b.kind === 'paragraph'
            ? `p ${plain(b)}`
            : b.kind,
    );

  it('reads the left column, then the right one, with their section labels', () => {
    expect(outline(blocks(300))).toEqual([
      '# Ohjelmat tänään',
      'list: 301 TV1, 302 TV2, 303 MTV3, 304 Nelonen, 305 Yle Teema & Yle Fem, 306 Ava, 307 Liv, 308 Sub, 309 JIM',
      'list: 320 TV:ssä nyt, 321 TV1 viikko, 322 TV2 viikko, 323-326 TV Finland, 330 TEKSTITYS, 337 Äänitekstitys, 338 Tekstinpeitto-sivu',
      '# Ohjelmat huomenna',
      'list: 310 TV1, 311 TV2, 312 Yle Teema & Fem',
      '# Ohjelmat ylihuomenna',
      'list: 315 TV1, 316 TV2, 317 Yle Teema & Fem',
      'list: 339 Yle Klassinen, 340 Radio 1, 341 YleX, 342 Radio Suomi, 344 Yöklassinen, 349 Radiossa nyt, 350 OHJELMAOPAS, 355 Yle Urheilu',
      'bar: 196-198 Aakkosellinen hakemisto',
    ]);
  });

  it('keeps every page link, only the order changes', () => {
    const across = toReaderBlocks(load(300)!, undefined, { columns: false });
    const key = (bs: ReaderBlock[]) =>
      entries(bs)
        .map(([a, b]) => `${a} ${b}`)
        .sort();
    expect(key(blocks(300))).toEqual(key(across));
    expect(entries(blocks(300)).length).toBe(31);
  });

  it('is only on for the page list', () => {
    expect([...COLUMN_PAGES]).toEqual([300]);
  });
});
