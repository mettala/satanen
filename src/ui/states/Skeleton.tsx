import type { ReactNode } from 'react';
import { View, type DimensionValue } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';

/** One grey placeholder bar, shared with the feed skeletons. */
export function Bar({
  width,
  height,
  mt,
}: {
  width?: DimensionValue;
  height: number;
  mt?: number;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        width: width ?? '100%',
        height,
        marginTop: mt,
        borderRadius: radius['radius-sm'],
        backgroundColor: colors.skeleton,
      }}
    />
  );
}

/** Exposes one "Ladataan" label instead of the individual bars. */
function Frame({
  children,
  label,
  flush,
}: {
  children: ReactNode;
  label?: string;
  /** No padding of its own: the parent list already insets its cards. */
  flush?: boolean;
}) {
  const { space } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t.a11y.loading}
      style={
        flush
          ? { gap: 10 }
          : { paddingHorizontal: space['space-5'], paddingVertical: space['space-1'], gap: 10 }
      }
    >
      {children}
    </View>
  );
}

/** Loading shape of the front page: lead card, then headline rows. */
export function FrontSkeleton({ label }: { label?: string }) {
  const { colors, radius, space } = useTheme();
  return (
    <Frame label={label}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius['radius-lg'],
          padding: space['space-4'] + 2,
          gap: 10,
        }}
      >
        <Bar width={90} height={12} />
        <Bar height={24} />
        <Bar width="70%" height={24} />
        <Bar height={12} mt={6} />
        <Bar width="80%" height={12} />
      </View>
      <Bar width={80} height={12} mt={12} />
      <Bar height={16} />
      <Bar width="75%" height={16} />
      <Bar height={16} mt={8} />
      <Bar width="60%" height={16} />
    </Frame>
  );
}

/** Loading shape of an article: label, two headline lines, text lines. */
export function ArticleSkeleton({ label }: { label?: string }) {
  return (
    <Frame label={label}>
      <Bar width={120} height={12} />
      <Bar height={24} />
      <Bar width="65%" height={24} />
      <Bar height={16} mt={14} />
      <Bar height={16} />
      <Bar width="90%" height={16} />
      <Bar height={16} mt={14} />
      <Bar width="95%" height={16} />
      <Bar width="55%" height={16} />
    </Frame>
  );
}

/** Loading shape of one favourite card: page number, title, meta. */
export function FavouriteSkeleton({ label }: { label?: string }) {
  const { colors, radius, space } = useTheme();
  return (
    <Frame label={label} flush>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius['radius-lg'],
          paddingVertical: space['space-4'],
          paddingHorizontal: space['space-5'],
          gap: 8,
        }}
      >
        <Bar width={48} height={12} />
        <Bar height={18} />
        <Bar width="60%" height={18} />
        <Bar width={100} height={12} mt={4} />
      </View>
    </Frame>
  );
}
