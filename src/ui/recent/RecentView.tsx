import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { sectionOf } from '../../sections/sectionOf';
import { recent, useStored } from '../../storage';
import { useSectionColor, useTheme, type SectionId } from '../../theme';
import { PageHeader } from '../lists/PageHeader';

export interface RecentViewProps {
  onOpenPage: (page: number) => void;
  onBack: () => void;
}

function RecentRow({ page, onPress }: { page: number; onPress: (page: number) => void }) {
  const { colors, type, size, space } = useTheme();
  const section = sectionOf(page);
  const dot = useSectionColor(section.id as SectionId);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t.jumpSheet.openRow(String(page), section.label)}
      onPress={() => onPress(page)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['space-4'],
        minHeight: size.touch,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={[
          type.styles['body-sm'],
          { minWidth: size.touch, color: colors.ink, fontVariant: ['tabular-nums'] },
        ]}
      >
        {page}
      </Text>
      <Text style={[type.styles.headline, { flex: 1, color: colors.ink }]}>{section.label}</Text>
      <View
        style={{
          width: size.dot,
          height: size.dot,
          borderRadius: size.dot / 2,
          backgroundColor: dot,
        }}
      />
    </Pressable>
  );
}

/** The list of recently read pages, newest first. */
export function RecentView({ onOpenPage, onBack }: RecentViewProps) {
  const { colors, type, space } = useTheme();
  const insets = useSafeAreaInsets();
  const list = useStored(recent.store);
  // Show nothing until storage has loaded, so the empty message does not flash.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void recent.store.ready().then(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t.recentScreen.title} onBack={onBack} hideNumber />
      {!loaded ? null : list.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space['space-5'] }}>
          <Text accessibilityRole="header" style={[type.styles.title, { color: colors.ink }]}>
            {t.recentScreen.emptyTitle}
          </Text>
          <Text
            style={[
              type.styles['body-sm'],
              { color: colors['ink-muted'], paddingTop: space['space-2'] },
            ]}
          >
            {t.recentScreen.emptyBody}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: space['space-5'],
            paddingBottom: insets.bottom + space['space-8'],
          }}
        >
          {list.map((page) => (
            <RecentRow key={page} page={page} onPress={onOpenPage} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
