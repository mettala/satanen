import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';

export interface JumpFieldProps {
  /** Opens the jump sheet. */
  onPress: () => void;
}

/** A button that looks like a search field: "Siirry sivulle…". */
export function JumpField({ onPress }: JumpFieldProps) {
  const { colors, type, radius, size, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.lists.jumpField}
      accessibilityHint={t.lists.jumpFieldHint}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['space-3'],
        height: size.touch,
        paddingHorizontal: 14,
        borderRadius: radius['radius-md'],
        backgroundColor: colors.field,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name="search" size={18} color={colors['ink-muted']} />
      <Text style={[type.styles['body-sm'], { color: colors['ink-muted'] }]}>
        {t.lists.jumpField}
      </Text>
    </Pressable>
  );
}
