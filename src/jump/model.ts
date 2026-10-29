/**
 * What the jump sheet shows for the digits typed so far. Pure; no React.
 *
 * - empty: the categories (as in the ☰ drawer), then favourites
 * - typing: matching favourites first, then `suggest()` groups per hundred-block
 * - jump: three valid digits, go straight to that page
 * - invalid: digits that can never be a page (first digit 0 or 9, or 3 digits out of range)
 */
import { t } from '../i18n';
import { MENU_SECTIONS } from '../sections/menu';
import { sectionOf } from '../sections/sectionOf';
import { suggest } from '../sections/suggest';
import type { PageRange, PageRef } from '../sections/types';
import type { SectionId } from '../theme';

export const MAX_DIGITS = 3;
const MIN_PAGE = 100;
const MAX_PAGE = 899;

export interface JumpRow {
  key: string;
  /** Page to open when pressed (first page of a range). */
  page: number;
  /** Digits as shown in the number column, e.g. "235", "23x" or "2xx". */
  code: string;
  title?: string;
  /** Page range such as "230–239", shown on the right. */
  range?: string;
  sectionId: SectionId;
}

export interface JumpGroup {
  key: string;
  title: string;
  rows: JumpRow[];
}

export type JumpModel =
  | { status: 'empty'; groups: JumpGroup[] }
  | { status: 'typing'; groups: JumpGroup[] }
  | { status: 'jump'; page: number; groups: [] }
  | { status: 'invalid'; groups: [] };

/** Keeps digits only, at most three. */
export function cleanDigits(input: string): string {
  return input.replace(/\D/g, '').slice(0, MAX_DIGITS);
}

/** True when no page in 100–899 starts with these digits. */
export function isDeadEnd(digits: string): boolean {
  if (digits === '') return false;
  if (digits.length === MAX_DIGITS) {
    const n = Number(digits);
    return n < MIN_PAGE || n > MAX_PAGE;
  }
  return digits[0] === '0' || digits[0] === '9';
}

function pageRow(page: number): JumpRow {
  const section = sectionOf(page);
  return { key: `p${page}`, page, code: String(page), title: section.label, sectionId: section.id };
}

function isRange(ref: PageRef): ref is PageRange {
  return typeof ref !== 'number';
}

/** "23x" for 230–239, "2xx" for 200–299, the page itself for one page. */
export function rangeCode(from: number, to: number): string {
  const f = String(from);
  const span = to - from + 1;
  if (span >= 100) return `${f[0]}xx`;
  if (span >= 10) return `${f.slice(0, 2)}x`;
  return f;
}

function blockTitle(hundred: number): string {
  const s = t.lists.sections;
  const names: Record<number, string> = {
    1: s.news,
    2: s.sport,
    3: s.programmes,
    4: s.weather,
    5: s.regions,
    7: s.swedish,
    8: s.weekly,
  };
  return `${names[hundred] ?? s.other} · ${hundred}XX`;
}

export function buildJumpModel(input: string, favourites: readonly number[]): JumpModel {
  const digits = cleanDigits(input);

  if (digits === '') {
    const groups: JumpGroup[] = [];
    groups.push({
      key: 'categories',
      title: t.jumpSheet.categories,
      rows: MENU_SECTIONS.map((s) => ({
        key: `c${s.page}`,
        page: s.page,
        code: String(s.page),
        title: t.drawer.sections[s.key],
        sectionId: s.section,
      })),
    });
    if (favourites.length > 0) {
      groups.push({
        key: 'favourites',
        title: t.jumpSheet.favourites,
        rows: favourites.map(pageRow),
      });
    }
    return { status: 'empty', groups };
  }

  if (isDeadEnd(digits)) return { status: 'invalid', groups: [] };
  if (digits.length === MAX_DIGITS) return { status: 'jump', page: Number(digits), groups: [] };

  const groups: JumpGroup[] = [];
  const favs = favourites.filter((p) => String(p).startsWith(digits));
  if (favs.length > 0) {
    groups.push({ key: 'favourites', title: t.jumpSheet.fromFavourites, rows: favs.map(pageRow) });
  }

  const byBlock = new Map<number, JumpRow[]>();
  for (const s of suggest(digits)) {
    const from = isRange(s.page) ? s.page.from : s.page;
    const to = isRange(s.page) ? s.page.to : s.page;
    const block = Math.floor(from / 100);
    const row: JumpRow = {
      key: `s${from}-${to}-${s.title}`,
      page: from,
      code: rangeCode(from, to),
      title: s.title,
      range: from === to ? undefined : `${from}–${to}`,
      sectionId: s.sectionId,
    };
    byBlock.set(block, [...(byBlock.get(block) ?? []), row]);
  }
  for (const [block, rows] of byBlock) {
    groups.push({ key: `block${block}`, title: blockTitle(block), rows });
  }
  return { status: 'typing', groups };
}
