import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { settings, useStored } from '../storage';
import { resolveScheme } from './resolve';
import { fontScaleFromRoot, scaleTextStyles } from './scale';
import { colors, radius, size, space, type } from './tokens.generated';
import type { ThemeId } from './tokens.generated';

export type { ThemeId };
export { colors, radius, size, space, themes, type } from './tokens.generated';

export type SectionId = 'news' | 'world' | 'business' | 'sport' | 'weather' | 'other';

const SECTION_COLOR_TOKEN: Record<SectionId, keyof (typeof colors)['light']> = {
  news: 'section-news',
  world: 'section-world',
  business: 'section-business',
  sport: 'section-sport',
  weather: 'section-weather',
  other: 'section-other',
};

export interface Theme {
  colors: (typeof colors)[ThemeId];
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
  size: typeof size;
  scheme: ThemeId;
  /** Web only: browser text size divided by 16. Always 1 on phones (the system scales text there). */
  fontScale: number;
}

const ThemeContext = createContext<Theme | null>(null);

function readWebFontScale(): number {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return 1;
  return fontScaleFromRoot(parseFloat(getComputedStyle(document.documentElement).fontSize));
}

/** The browser's text-size setting as a factor (D22); stays 1 on phones. */
function useWebFontScale(): number {
  const [scale, setScale] = useState(readWebFontScale);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const update = () => setScale(readWebFontScale());
    update();
    window.addEventListener('resize', update);
    // Changing the browser's text size does not fire "resize". A hidden 1rem-wide probe
    // changes size when it does, so watching it makes the text size live.
    let probe: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:fixed;left:-100px;top:0;width:1rem;height:1px;visibility:hidden;pointer-events:none;';
      document.body.appendChild(probe);
      observer = new ResizeObserver(update);
      observer.observe(probe);
    }
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
      probe?.remove();
    };
  }, []);
  return scale;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const { theme: choice } = useStored(settings.store);
  const scheme: ThemeId = resolveScheme(choice, system);
  const fontScale = useWebFontScale();

  const value = useMemo<Theme>(
    () => ({
      colors: colors[scheme],
      type: { ...type, styles: scaleTextStyles(type.styles, fontScale) },
      space,
      radius,
      size,
      scheme,
      fontScale,
    }),
    [scheme, fontScale],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return theme;
}

/** Colour for a section id, falling back to `section-other` for unknown sections. */
export function useSectionColor(id: SectionId): string {
  const { colors: c } = useTheme();
  return c[SECTION_COLOR_TOKEN[id]];
}
