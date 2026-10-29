import { View } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';
import { SkeletonBar as Bar } from '../states';

/** Loading shape of a feed: a few items with label, headline and paragraph bars. */
export function FeedSkeleton({ count = 3, label }: { count?: number; label?: string }) {
  const { colors, space } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t.a11y.loading}
      style={{ paddingHorizontal: space['space-5'] }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            gap: space['space-2'],
            paddingVertical: space['space-4'],
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          <Bar width={110} height={12} />
          <Bar width="100%" height={24} />
          <Bar width="65%" height={24} />
          <Bar width="100%" height={14} mt={4} />
          <Bar width="70%" height={14} />
        </View>
      ))}
    </View>
  );
}
