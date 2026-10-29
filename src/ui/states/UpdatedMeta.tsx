import { Text } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';

export interface UpdatedMetaProps {
  /** Finnish clock time, e.g. "14:32". */
  time: string;
  /** True when the device is offline and the copy is from storage. */
  offline?: boolean;
  /** True when Yle did not answer and an old copy is shown. */
  stale?: boolean;
  /** A device copy is shown while the fresh one loads: "Päivitetään…" (D39 A). */
  updating?: boolean;
}

/** "Päivitetty 14:32", "Päivitetty 14:32 · ei yhteyttä", with the stale-copy note, or "Päivitetään…". */
export function UpdatedMeta({ time, offline, stale, updating }: UpdatedMetaProps) {
  const { colors, type } = useTheme();
  let text = offline ? t.states.offlineMeta(time) : t.states.updated(time);
  if (stale) text = `${text} · ${t.states.staleCopy}`;
  if (updating) text = t.refresh.updating;
  return <Text style={[type.styles.meta, { color: colors['ink-muted'] }]}>{text}</Text>;
}
