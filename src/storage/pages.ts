export const MIN_PAGE = 100;
export const MAX_PAGE = 899;

export function isValidPage(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= MIN_PAGE && (n as number) <= MAX_PAGE;
}

/** Keeps valid pages only, drops duplicates, keeps order. */
export function cleanPages(raw: unknown, max: number): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<number>();
  for (const n of raw) if (isValidPage(n)) seen.add(n);
  return [...seen].slice(0, max);
}
