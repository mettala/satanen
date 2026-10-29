import { Platform, type TextStyle } from 'react-native';

/**
 * For text clamped with `numberOfLines` (first paragraphs). On the web a
 * Text keeps the spaces at line ends (`white-space: pre-wrap`), so the "…"
 * of a cut paragraph landed after a space ("verrattuna, …"). Normal wrapping
 * drops that space, so the "…" sits on the last word. Only the layout
 * changes; the text itself is never shortened or reworded.
 */
export const clampedText = (Platform.OS === 'web' ? { whiteSpace: 'normal' } : {}) as TextStyle;
