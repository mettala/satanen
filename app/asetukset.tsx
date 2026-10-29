import { View } from 'react-native';

import { useTheme } from '../src/theme';
import { BottomTabBar } from '../src/ui/BottomTabBar';
import { SettingsScreen } from '../src/ui/settings/SettingsScreen';

export default function SettingsRoute() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        <SettingsScreen />
      </View>
      <BottomTabBar />
    </View>
  );
}
