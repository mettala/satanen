import type { ThemeId } from './tokens.generated';

export type ThemeChoice = 'system' | 'light' | 'dark';

/** Turns the saved choice and the phone's setting into the theme to show. */
export function resolveScheme(choice: ThemeChoice, system: string | null | undefined): ThemeId {
  if (choice === 'light' || choice === 'dark') return choice;
  return system === 'dark' ? 'dark' : 'light';
}
