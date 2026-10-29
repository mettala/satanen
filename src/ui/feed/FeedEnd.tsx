import { View } from 'react-native';

import { useTheme } from '../../theme';
import { UpdatedMeta } from '../states';

export interface FeedEndProps {
  /** Finnish clock time, e.g. "14:32". */
  time: string;
  offline?: boolean;
  /** The proxy's last good copy is shown (D11). */
  stale?: boolean;
}

/** The end of a feed: "Päivitetty 14:32". Refreshing is done from the top of the feed. */
export function FeedEnd({ time, offline, stale }: FeedEndProps) {
  const { colors, space } = useTheme();
  return (
    <View
      style={{
        alignItems: 'flex-start',
        paddingVertical: space['space-5'],
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      <UpdatedMeta time={time} offline={offline} stale={stale} />
    </View>
  );
}
