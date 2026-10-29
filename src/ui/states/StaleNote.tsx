import { Text, View } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';

/**
 * The proxy served its last good copy because Yle didn't answer (D11, D39 A):
 * a plain note in reading-size text at the top, not the small print it used
 * to be. A card like "Sivu päivitetty": surface, hairline, `radius-md`.
 */
export function StaleNote({ time }: { time: string }) {
  const { colors, type, space, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius['radius-md'],
        paddingVertical: space['space-3'],
        paddingHorizontal: space['space-4'],
      }}
    >
      <Text style={[type.styles['body-sm'], { color: colors.ink }]}>
        {t.states.staleNote(time)}
      </Text>
    </View>
  );
}
