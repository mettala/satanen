/** Dev tools are only for `npm run web`; in a production build they show "not found". */
import { Slot, useRouter } from 'expo-router';
import { View } from 'react-native';

import { useTheme } from '../../src/theme';
import { ErrorState } from '../../src/ui/states';

export default function DevLayout() {
  const router = useRouter();
  const { colors } = useTheme();
  if (__DEV__) return <Slot />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ErrorState
        kind="notFound"
        page={0}
        onHome={() => router.replace('/')}
        onJump={() => router.push('/siirry')}
      />
    </View>
  );
}
