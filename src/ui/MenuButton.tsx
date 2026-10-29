import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { t } from '../i18n';
import { useTheme } from '../theme';

/** The ☰ button: first in every header, top-left. Opens the drawer unless told otherwise. */
export function MenuButton({ onPress }: { onPress?: () => void }) {
  const { colors, size } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.a11y.menu}
      onPress={onPress ?? (() => router.push('/valikko'))}
      style={{
        width: size.touch,
        height: size.touch,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="menu" size={24} color={colors.ink} />
    </Pressable>
  );
}
