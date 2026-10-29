import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { FAVOURITES_ENABLED } from '../src/features';
import { t } from '../src/i18n';
import { hrefOfPage } from '../src/sections/destination';
import { favourites, useStored } from '../src/storage';
import { useTheme } from '../src/theme';
import { JumpSheet } from '../src/ui/jump/JumpSheet';

/** Jump sheet over the current screen (D16). */
export default function JumpScreen() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const { width } = useWindowDimensions();
  // On a wide window the sheet floats with a gap below it instead of running to the bottom edge.
  const floating = width >= 700;
  const favs = useStored(favourites.store);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const open = (page: number) => router.replace(hrefOfPage(page) as never);

  return (
    <View style={{ flex: 1, backgroundColor: colors.scrim }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.a11y.closeJump}
        onPress={close}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={{ height: space['space-8'] + space['space-6'] }} />
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
          maxHeight: floating ? 640 : undefined,
          marginBottom: floating ? space['space-8'] : 0,
        }}
      >
        <JumpSheet
          favourites={FAVOURITES_ENABLED ? favs : []}
          onOpenPage={open}
          onClose={close}
          onOpenRecent={() => router.replace('/viimeksi')}
          floating={floating}
        />
      </View>
    </View>
  );
}
