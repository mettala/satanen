import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { mosaicCells } from './graphicsMode';

const here = fileURLToPath(new URL('.', import.meta.url));
const pagesDir = resolve(here, '../../fixtures/pages');

/** Row `row` of subpage 1 of fixture `n`: Yle's `all` text and the `structured` row joined. */
function rawRow(n: number, row: number): { all: string; text: string } {
  const page = JSON.parse(readFileSync(resolve(pagesDir, `${n}.json`), 'utf8')).teletext.page;
  const sp = [page.subpage].flat()[0];
  const of = (type: string) =>
    sp.content
      .find((c: { type: string }) => c.type === type)
      .line.find((l: { number: string }) => Number(l.number) === row);
  const runs = [of('structured').run].flat();
  const text = runs.map((r: any) => r.Text ?? ' '.repeat(Number(r.length))).join('');
  return { all: of('all').Text ?? '', text };
}

/** The cells marked as mosaic, as the row with every other cell shown as `.`. */
function marked(text: string, mosaic: boolean[] | undefined): string {
  if (!mosaic) return 'undefined';
  return [...text].map((c, i) => (mosaic[i] ? c : '.')).join('');
}

describe('mosaicCells: teletext graphics mode from the `all` content', () => {
  it('switches to graphics after a graphics colour code and back after a text one (set-after)', () => {
    // {GRed} at cell 0, `ab` in graphics, {Red} at cell 3 still graphics, `cd` text.
    const text = ' ab cd';
    expect(marked(text, mosaicCells('{GRed}ab{Red}cd', text))).toBe('.ab ..');
  });

  it('keeps upper-case letters as text in graphics mode (blast-through)', () => {
    const text = ' xTORSTAIy ÄÖÅ';
    expect(marked(text, mosaicCells('{GBlue}xTORSTAIy ÄÖÅ', text))).toBe('.x.......y ...');
  });

  it('reads a `{` that starts no code as a character (891 row 5: `{{GYellow}`)', () => {
    const text = ' a { b';
    expect(marked(text, mosaicCells('{GYellow}a {{GYellow}b', text))).toBe('.a { b');
  });

  it('does not change the mode on other codes: SG, CG, NB, Hold, DH, NH, Flash, Steady, SB', () => {
    const text = '         ab';
    const all = '{SB}{GRed}{SG}{CG}{NB}{Hold}{DH}{NH}{Flash}ab';
    expect(marked(text, mosaicCells(all, text))).toBe('..       ab');
  });

  it('gives up on a code it does not know, so the row stays as `structured` sent it', () => {
    expect(mosaicCells('{GRed}ab{Conceal}cd', ' ab cd')).toBeUndefined();
  });

  it('gives up when `all` does not match the `structured` row cell for cell', () => {
    expect(mosaicCells('{GRed}ab', ' xb')).toBeUndefined();
    // A control cell must be a space in `structured`.
    expect(mosaicCells('{GRed}ab', 'xab')).toBeUndefined();
    // More cells than the row.
    expect(mosaicCells('{GRed}abcd', ' ab')).toBeUndefined();
  });

  it('891 row 9: the sun picture is mosaic, `AURINKO   NOUSEE LASKEE` is text', () => {
    const { all, text } = rawRow(891, 9);
    expect(text).toBe('   + bs,bupuu AURINKO   NOUSEE LASKEE   ');
    expect(marked(text, mosaicCells(all, text))).toBe('.' + '  + bs,bupuu ' + '.'.repeat(26));
  });

  it('891 row 5: the big date `82 w { 80` is mosaic', () => {
    const { all, text } = rawRow(891, 5);
    const mosaic = mosaicCells(all, text);
    expect(text.slice(0, 15)).toBe('    82 w { 80  ');
    expect(mosaic?.slice(1, 15).every(Boolean)).toBe(true);
  });

  it('130 and 160 row 2: `TORSTAI` in graphics mode is blast-through text, never mosaic', () => {
    for (const n of [130, 160]) {
      const { all, text } = rawRow(n, 2);
      const mosaic = mosaicCells(all, text);
      expect(mosaic).toBeDefined();
      const at = text.indexOf('TORSTAI');
      expect(at).toBeGreaterThan(0);
      expect(mosaic?.slice(at, at + 7).some(Boolean)).toBe(false);
    }
  });
});
