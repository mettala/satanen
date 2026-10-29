import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n';
import { useTheme } from '../theme';
import { LogoMark } from './LogoMark';
import { MenuButton } from './MenuButton';

export interface HeaderProps {
  /** Opens the drawer. */
  onMenu?: () => void;
}

export function Header({ onMenu }: HeaderProps = {}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { colors, space } = theme;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: insets.top + space['space-2'],
        paddingRight: space['space-5'],
        paddingBottom: space['space-3'],
        paddingLeft: space['space-2'],
      }}
    >
      <MenuButton onPress={onMenu} />
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minWidth: 'auto',
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['space-3'],
        }}
      >
        <View style={{ flexShrink: 0 }}>
          <LogoMark size={28} />
        </View>
        <Text style={[theme.type.styles.title, { color: colors.ink, flexShrink: 1 }]}>
          {t.common.appName}
        </Text>
      </View>
    </View>
  );
}
