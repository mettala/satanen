import { Platform, Pressable, Text, View, type TextStyle } from 'react-native';

import { t } from '../../i18n';
import { sectionOf } from '../../sections/sectionOf';
import { useTheme } from '../../theme';
import { clampedText } from '../clamp';
import { BriefRows } from '../feed/BriefRows';
import { briefCardPlan, type BriefCardData } from '../feed/briefCard';
import { SectionLabel } from './SectionLabel';

/** Breaks long Finnish words at syllables instead of anywhere (web; the page language is set to fi). */
const hyphenate = (Platform.OS === 'web' ? { hyphens: 'auto' } : {}) as TextStyle;

export interface LeadCardProps {
  title: string;
  page: number;
  /** First paragraph of the article, unmodified; clamped on screen. */
  ingress?: string;
  /** Show placeholder bars where the ingress will appear. */
  ingressLoading?: boolean;
  /** A brief page (D35): its own name and count, and its first briefs instead of the ingress. */
  briefs?: BriefCardData | null;
  onPress: (page: number) => void;
}

/** The front page's top story. One per screen. */
export function LeadCard({ title, page, ingress, ingressLoading, briefs, onPress }: LeadCardProps) {
  const { colors, type, radius, space } = useTheme();
  const section = sectionOf(page);
  const card = briefs && !ingressLoading ? briefCardPlan(briefs, title) : null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t.lists.openPage(card ? card.accessibilityLabel : title, page)}
      onPress={() => onPress(page)}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: radius['radius-lg'],
        padding: space['space-4'] + 2,
        gap: space['space-2'],
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <SectionLabel
        section={section.id}
        label={section.label}
        suffix={card ? `${page} · ${card.count}` : page}
      />
      <Text style={[type.styles.lead, { color: colors.ink }, hyphenate]}>
        {card ? card.headline : title}
      </Text>
      {card ? (
        <BriefRows plan={card} />
      ) : ingress ? (
        <Text
          numberOfLines={3}
          style={[type.styles['body-sm'], { color: colors['ink-muted'] }, clampedText]}
        >
          {ingress}
        </Text>
      ) : ingressLoading ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t.front.ingressLoading}
          style={{ gap: 8, marginTop: 4 }}
        >
          <View
            style={{
              height: 12,
              borderRadius: radius['radius-sm'],
              backgroundColor: colors.skeleton,
            }}
          />
          <View
            style={{
              width: '80%',
              height: 12,
              borderRadius: radius['radius-sm'],
              backgroundColor: colors.skeleton,
            }}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
