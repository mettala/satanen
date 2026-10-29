/** Dev-only gallery (/dev/states): every loading, error and updated state. */
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../src/i18n';
import { useTheme } from '../../src/theme';
import {
  ArticleSkeleton,
  ErrorState,
  FavouriteSkeleton,
  FrontSkeleton,
  StaleNote,
  UpdatedMeta,
  type ErrorKind,
} from '../../src/ui/states';
import { PageUpdatedNotice } from '../../src/ui/refresh/PageUpdatedNotice';
import { UpdateListButton } from '../../src/ui/refresh/UpdateListButton';

const KINDS: ErrorKind[] = ['notFound', 'offline', 'upstream', 'badData'];
const noop = () => {};

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, type, space } = useTheme();
  return (
    <View style={{ gap: space['space-2'] }}>
      <Text
        style={[
          type.styles.label,
          { color: colors['ink-muted'], paddingHorizontal: space['space-5'] },
        ]}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

export default function StatesGallery() {
  const { colors, type, space, radius } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + space['space-4'],
        paddingBottom: insets.bottom + space['space-8'],
        gap: space['space-8'],
      }}
    >
      <Text style={[type.styles.title, { color: colors.ink, paddingHorizontal: space['space-5'] }]}>
        {t.stateKit.devTitle}
      </Text>
      <Section title={t.stateKit.devFront}>
        <FrontSkeleton />
      </Section>
      <Section title={t.stateKit.devArticle}>
        <ArticleSkeleton />
      </Section>
      <Section title={t.stateKit.devFavourite}>
        <FavouriteSkeleton />
      </Section>
      <Section title={t.stateKit.devErrors}>
        {KINDS.map((kind) => (
          <View
            key={kind}
            style={{
              height: 300,
              borderRadius: radius['radius-lg'],
              backgroundColor: colors.surface,
              marginHorizontal: space['space-4'],
            }}
          >
            <ErrorState kind={kind} page={345} onHome={noop} onJump={noop} onRetry={noop} />
          </View>
        ))}
      </Section>
      <Section title={t.stateKit.devMeta}>
        <View style={{ paddingHorizontal: space['space-5'], gap: space['space-2'] }}>
          <UpdatedMeta time="14:32" />
          <UpdatedMeta time="14:32" offline />
          <UpdatedMeta time="14:32" stale />
          <UpdatedMeta time="14:32" updating />
          <StaleNote time="14:32" />
        </View>
      </Section>
      <Section title={t.stateKit.devRefresh}>
        <View style={{ height: 76 }}>
          <UpdateListButton onPress={noop} />
        </View>
        <View style={{ height: 76 }}>
          <PageUpdatedNotice visible count={1} />
        </View>
      </Section>
    </ScrollView>
  );
}
