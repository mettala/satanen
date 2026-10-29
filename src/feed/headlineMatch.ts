/**
 * Is the article on screen the story its list showed (D39 C, FR.4)? Yle
 * reuses page numbers, so a copy of 134 cached a while ago can be another
 * story than the headline the reader tapped.
 *
 * The list's headline is the index row (`FeedItem.headline`, D25, D31); the
 * article's is Yle's double-height heading (`pageHeadline`). Yle often words
 * them a little differently for the same story: on 21.10. list 130 and
 * Etusivu said `Putin: Olen valmis neuvotteluihin` and article 136 said
 * `Putin valmis neuvotteluihin`; Etusivu writes some headlines in capitals
 * (`TEKSTI-TV:N NETTIVERSION KATKOS OHI`). So the words are compared the way
 * D31 picks a bulletin's story (`wordKeys`: words of 3+ letters, lower case,
 * first 5 letters), never the exact text.
 *
 * Rules (each has a fixture test in headlineMatch.test.ts):
 *
 * - `unknown`: the article has no heading (bulletins such as 202, result
 *   tables such as 203 and 221), or either side has no word to compare
 *   (`F1`). Nothing is done: better to show the page than to guess.
 * - `same`: they share at least `MATCH_MIN_WORDS` words (2), or every word of
 *   the shorter one when it has fewer.
 * - `differs`: otherwise. A false `differs` costs one quiet request to the
 *   proxy, which the proxy limits; a false `same` shows the copy as before.
 *
 * The text itself is never changed; this only decides whether to ask again.
 */
import { MATCH_MIN_WORDS, wordKeys } from '../front/frontPage';

export type HeadlineMatch = 'same' | 'differs' | 'unknown';

export function matchHeadline(listed: string, article: string | undefined): HeadlineMatch {
  if (article === undefined) return 'unknown';
  const a = wordKeys(listed);
  const b = wordKeys(article);
  const needed = Math.min(MATCH_MIN_WORDS, a.size, b.size);
  if (needed === 0) return 'unknown';
  let shared = 0;
  for (const k of a) if (b.has(k)) shared++;
  return shared >= needed ? 'same' : 'differs';
}
