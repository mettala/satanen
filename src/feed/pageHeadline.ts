import { toReaderBlocks } from '../parser/blocks';
import type { Page } from '../parser/model';

/**
 * The headline of an article page: Yle's double-height heading, exactly as
 * printed. Undefined for a page that doesn't start with one (index pages,
 * bulletins, tables), so the footer then shows only the page number.
 */
export function pageHeadline(page: Page): string | undefined {
  const first = toReaderBlocks(page).find((b) => b.kind !== 'title');
  if (first?.kind !== 'heading') return undefined;
  const text = first.text.trim();
  return text === '' ? undefined : text;
}
