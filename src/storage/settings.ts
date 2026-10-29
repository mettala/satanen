import { createStore } from './store';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemeChoice;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system' };

const THEMES: readonly string[] = ['system', 'light', 'dark'];

export const settingsStore = createStore<Settings>('settings', DEFAULT_SETTINGS, (raw) => {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const theme = (raw as { theme?: unknown }).theme;
  return {
    theme: typeof theme === 'string' && THEMES.includes(theme) ? (theme as ThemeChoice) : 'system',
  };
});

export const settings = {
  store: settingsStore,
  setTheme: (theme: ThemeChoice) =>
    THEMES.includes(theme) ? settingsStore.update((s) => ({ ...s, theme })) : Promise.resolve(),
};
