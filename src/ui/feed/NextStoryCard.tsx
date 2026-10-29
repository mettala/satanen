import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { t } from '../../i18n';
import { useTheme, type SectionId } from '../../theme';
import { SectionLabel } from '../lists/SectionLabel';
import { feedSectionName } from './sectionName';

export interface NextStoryCardProps {
  /** Previous story's headline; omit on the first story (no button). */
  previous?: { headline: string; label?: string; onPress: () => void };
  /** Next story; omit on the last story (no card). */
  next?: {
    section: SectionId;
    page: number;
    headline: string;
    label?: string;
    onPress: () => void;
  };
}

/** Footer of an article opened from a feed: ‹ previous button and a card for the next story. */
export function NextStoryCard({ previous, next }: NextStoryCardProps) {
  const { colors, type, size, space, radius } = useTheme();
  if (!previous && !next) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: space['space-2'],
        paddingTop: space['space-2'],
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      {previous ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previous.label ?? t.feed.previousStory(previous.headline)}
          onPress={previous.onPress}
          style={({ pressed }) => ({
            width: size.touch,
            minHeight: size.touch,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={24} color={colors['ink-muted']} />
        </Pressable>
      ) : null}
      {next ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={next.label ?? t.feed.nextStory(next.headline)}
          onPress={next.onPress}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: size.touch,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['space-3'],
            paddingVertical: space['space-3'],
            paddingLeft: space['space-4'],
            paddingRight: space['space-3'],
            borderRadius: radius['radius-lg'],
            backgroundColor: colors.surface,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View style={{ flex: 1, gap: space['space-1'] }}>
            <SectionLabel
              section={next.section}
              label={feedSectionName(next.section)}
              suffix={next.page}
            />
            <Text numberOfLines={2} style={[type.styles.headline, { color: colors.ink }]}>
              {next.headline}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}
