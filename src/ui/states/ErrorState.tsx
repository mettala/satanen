import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';

export type ErrorKind = 'notFound' | 'offline' | 'upstream' | 'badData';

export interface ErrorStateProps {
  kind: ErrorKind;
  /** Page number, used in the not-found sentence. */
  page?: number;
  /** Leave out to hide the "Etusivulle" action (e.g. when this already is the front page). */
  onHome?: () => void;
  onJump?: () => void;
  onRetry?: () => void;
}

function copy(kind: ErrorKind, page: number): { title: string; body: string } {
  switch (kind) {
    case 'notFound':
      return { title: t.states.notFoundTitle, body: t.states.notFoundBody(page) };
    case 'offline':
      return { title: t.states.offlineTitle, body: t.states.offlineBody };
    case 'upstream':
      return { title: t.stateKit.upstreamTitle, body: t.states.upstream };
    case 'badData':
      return { title: t.stateKit.badDataTitle, body: t.states.badData };
  }
}

function Action({ label, onPress }: { label: string; onPress?: () => void }) {
  const { colors, type, size } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: size.touch, minWidth: size.touch, justifyContent: 'center' }}
    >
      <Text
        style={[
          type.styles['body-sm'],
          { color: colors.link, fontFamily: 'SchibstedGrotesk_600SemiBold' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Calm full-area error: danger icon + title, one sentence, text actions. */
export function ErrorState({ kind, page = 0, onHome, onJump, onRetry }: ErrorStateProps) {
  const { colors, type, space } = useTheme();
  const { title, body } = copy(kind, page);
  const notFound = kind === 'notFound';

  return (
    <View
      accessibilityRole="alert"
      style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space['space-8'], gap: 10 }}
    >
      <Ionicons
        name={kind === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'}
        size={28}
        color={colors.danger}
      />
      <Text accessibilityRole="header" style={[type.styles.title, { color: colors.danger }]}>
        {title}
      </Text>
      <Text style={[type.styles['body-sm'], { color: colors['ink-muted'] }]}>{body}</Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: space['space-5'],
          marginTop: 6,
        }}
      >
        {!notFound && <Action label={t.states.retry} onPress={onRetry} />}
        {onHome ? <Action label={t.states.home} onPress={onHome} /> : null}
        {notFound && <Action label={t.states.jump} onPress={onJump} />}
      </View>
    </View>
  );
}
