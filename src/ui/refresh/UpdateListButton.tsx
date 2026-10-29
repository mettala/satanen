import { Pressable, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

import { t } from '../../i18n';
import { useTheme } from '../../theme';

/**
 * "Päivitä lista" (D39 A, design/screens/11-paivitys.html): floats over the
 * top of a list, centred, when a newer list differs from the one shown. It has
 * the active chip's look (ink ground, bg text). Render it inside the list's
 * `flex: 1` area, after the list, so it sits over it and nothing moves.
 */
export function UpdateListButton({ onPress }: { onPress: () => void }) {
  const { colors, type, space, radius, size } = useTheme();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: space['space-3'],
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.refresh.updateList}
        accessibilityHint={t.refresh.updateListHint}
        onPress={onPress}
        style={{
          minHeight: size.touch,
          flexDirection: 'row',
          alignItems: 'center',
          columnGap: space['space-2'],
          // 18 px, as in the mock-up.
          paddingHorizontal: space['space-4'] + 2,
          borderRadius: radius['radius-md'],
          backgroundColor: colors.ink,
        }}
      >
        <Svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.bg}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <Path d="M12 19V5M5 12l7-7 7 7" />
        </Svg>
        <Text
          numberOfLines={1}
          style={[
            type.styles['body-sm'],
            { color: colors.bg, fontFamily: 'SchibstedGrotesk_700Bold' },
          ]}
        >
          {t.refresh.updateList}
        </Text>
      </Pressable>
    </View>
  );
}
