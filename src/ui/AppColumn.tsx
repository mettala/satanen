import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme';

/** Widest the app gets; on a wider window it stays a centred column. */
export const MAX_CONTENT_WIDTH = 640;

/**
 * The one shared container for every screen (and the tab bar, drawer and
 * sheets inside it): a centred column on desktop, full width on a phone.
 */
export function AppColumn({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>{children}</View>
    </View>
  );
}
