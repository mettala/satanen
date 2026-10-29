/**
 * Which footer an article shows (decision D28): the next-story card when the
 * article was opened from a list whose snapshot still has it, otherwise the
 * footer built from Yle's previous and next page numbers.
 *
 * The label and colour of a story come from its list item (`item.section`),
 * never from `sectionOf(page)`: a football page in 6xx is Urheilu in the
 * Urheilu feed.
 */
import type { FrontPage } from '../front/frontPage';
import type { Neighbours } from './feedStore';
import type { FeedItem } from './feedList';
import { isValidPageNumber } from '../api/client';

export type FooterChoice =
  | { kind: 'story'; previous: FeedItem | null; next: FeedItem | null }
  | { kind: 'pages'; prev?: number; next?: number };

/** `lookup` is `feedStore.neighbours` (or a fake); `feed` is the `?feed=` value, if any. */
export function chooseFooter(
  feed: string | undefined,
  page: number,
  lookup: (id: string, page: number) => Neighbours | null,
  yle: { prevPage?: number; nextPage?: number },
): FooterChoice {
  const found = feed ? lookup(feed, page) : null;
  if (found) return { kind: 'story', previous: found.previous, next: found.next };
  // Yle's numbers are data: 100 has no previous, and nothing follows 899.
  const ok = (n?: number) => (isValidPageNumber(n) ? n : undefined);
  return { kind: 'pages', prev: ok(yle.prevPage), next: ok(yle.nextPage) };
}

/** Etusivu's reading order: the lead, then each group's headlines. */
export function etusivuItems(front: FrontPage): FeedItem[] {
  const all = front.lead ? [front.lead] : [];
  for (const g of front.groups) all.push(...g.headlines);
  return all.map((h) => ({ page: h.page, headline: h.text, section: h.section }));
}
