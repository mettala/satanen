import type { LinkEntry, ReaderBlock } from './blocks';

/** The sports front: Yle's page 200. */
export const SPORT_FRONT_PAGE = 200;

/** Names for the fixed cards and list rows (from `t.sport`, passed in so the parser has no UI text). */
export interface SportNames {
  card: Readonly<Record<SportCardKey, string>>;
  row: Readonly<Record<SportRowKey, string>>;
}

export type SportCardKey = 'news' | 'shl' | 'nhl' | 'f1' | 'rally' | 'euroFootball' | 'bigEvents';
export type SportRowKey = SportCardKey | 'ballGames';

/**
 * The cards, in the owner's order (RP.5). Pages 600 and 670 are not on Yle's
 * page 200, so the cards are kept here and not read from the page.
 */
export const SPORT_CARDS: readonly (readonly [number, SportCardKey])[] = [
  [201, 'news'],
  [223, 'shl'],
  [237, 'nhl'],
  [298, 'f1'],
  [299, 'rally'],
  [670, 'euroFootball'],
  [600, 'bigEvents'],
];

/** The list rows we name ourselves: every card's page, plus Palloilu 220 (no longer a card). */
export const SPORT_ROWS: readonly (readonly [number, SportRowKey])[] = [
  ...SPORT_CARDS,
  [220, 'ballGames'],
];

/** Yle's 650 EUROJALKAPALLO is out of date: the teletext index shows 670. */
const REPLACED_PAGES: ReadonlySet<number> = new Set([650]);

function entry(page: number, label: string): LinkEntry {
  return { label, target: { kind: 'page', page }, linkText: String(page) };
}

function keyOf(target: LinkEntry['target']): number {
  if (target.kind === 'page') return target.page;
  if (target.kind === 'range') return target.from;
  return Number.POSITIVE_INFINITY;
}

/**
 * Urheilu (200) as the owner wants it (RP.5): the cards on top, then one list
 * of everything sorted by page number. Yle's own rows stay, except the stale
 * 650, and our names win for the pages we name.
 */
export function sportFront(blocks: readonly ReaderBlock[], names: SportNames): ReaderBlock[] {
  const ours = new Map<number, string>(SPORT_ROWS.map(([p, k]) => [p, names.row[k]]));
  const yle: LinkEntry[] = [];
  const rest: ReaderBlock[] = [];
  let at = -1;
  for (const b of blocks) {
    if (b.kind === 'linkList') {
      if (at < 0) at = rest.length;
      yle.push(...b.entries);
    } else {
      rest.push(b);
    }
  }
  const list = yle
    .filter((e) => !REPLACED_PAGES.has(keyOf(e.target)) && !ours.has(keyOf(e.target)))
    .concat([...ours].map(([p, label]) => entry(p, label)))
    // Array.sort is stable: a range and a page with the same start keep Yle's order.
    .sort((a, b) => keyOf(a.target) - keyOf(b.target));
  const cards = SPORT_CARDS.map(([p, k]) => entry(p, names.card[k]));
  const at0 = at < 0 ? rest.length : at;
  return [
    ...rest.slice(0, at0),
    { kind: 'linkList', variant: 'bar', entries: cards },
    { kind: 'linkList', variant: 'list', entries: list },
    ...rest.slice(at0),
  ];
}
