// Text size scaling for the web (D22). Token sizes are px numbers; on the web
// they don't follow the browser's text-size setting by themselves, so they are
// multiplied by (root font size / 16). On phones React Native already applies
// the system font scale, so the factor stays 1 there.

export const BASE_ROOT_FONT_PX = 16;

/** Biggest factor we apply, so a huge setting can't push layouts off the screen. */
export const MAX_FONT_SCALE = 3;

/** Factor for a root font size in px (the browser default 16 gives 1). */
export function fontScaleFromRoot(rootPx: number | null | undefined): number {
  if (typeof rootPx !== 'number' || !Number.isFinite(rootPx) || rootPx <= 0) return 1;
  return Math.min(MAX_FONT_SCALE, Math.max(1, rootPx / BASE_ROOT_FONT_PX));
}

interface Scalable {
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Returns the text styles with size, line height and letter spacing multiplied by `scale`. */
export function scaleTextStyles<T extends Record<string, Scalable>>(styles: T, scale: number): T {
  if (scale === 1) return styles;
  const out: Record<string, Scalable> = {};
  for (const [name, style] of Object.entries(styles)) {
    const next: Scalable = { ...style };
    if (style.fontSize !== undefined) next.fontSize = round(style.fontSize * scale);
    if (style.lineHeight !== undefined) next.lineHeight = round(style.lineHeight * scale);
    if (style.letterSpacing !== undefined) next.letterSpacing = round(style.letterSpacing * scale);
    out[name] = next;
  }
  return out as T;
}

/** Tab labels share a narrow bar, so they grow with the text size only up to this factor. */
export const MAX_TAB_LABEL_SCALE = 1.5;

/** The factor tab labels use for a given text-size factor. */
export function tabLabelScale(fontScale: number): number {
  return Math.min(MAX_TAB_LABEL_SCALE, Math.max(1, fontScale));
}
