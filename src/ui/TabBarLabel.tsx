import type { ReactNode } from 'react';
import { Text } from 'react-native';
import type { ColorValue } from 'react-native';

import { type as baseType, useTheme } from '../theme';
import { MAX_TAB_LABEL_SCALE, scaleTextStyles, tabLabelScale } from '../theme/scale';

export function TabBarLabel({ color, children }: { color: ColorValue; children: ReactNode }) {
  const theme = useTheme();
  // Five labels share a 390 px bar, so they are capped (see tabLabelScale). Web: fontScale is the browser setting (already in theme styles), capped here. Phones: 1.
  const style = scaleTextStyles({ tab: baseType.styles.tab }, tabLabelScale(theme.fontScale)).tab;

  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={MAX_TAB_LABEL_SCALE}
      style={[style, { color, alignSelf: 'stretch', textAlign: 'center' }]}
    >
      {children}
    </Text>
  );
}
