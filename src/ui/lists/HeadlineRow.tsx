import { Platform, Pressable, Text, View, type TextStyle } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';
import { BriefRows } from '../feed/BriefRows';
import { briefCardPlan, type BriefCardData } from '../feed/briefCard';
import { FirstParagraph } from '../feed/FirstParagraph';

const hyphenate = (Platform.OS === 'web' ? { hyphens: 'auto' } : {}) as TextStyle;

export interface HeadlineRowProps {
  title: string;
  page: number;
  onPress: (page: number) => void;
  /** The article's first paragraph, shown under the headline (Etusivu). Missing: headline only. */
  paragraph?: string | null;
  /** A brief page (D35): its own name and count, and its first briefs under it. */
  briefs?: BriefCardData | null;
  /** The article is still loading: grey bars where the paragraph will go. */
  loading?: boolean;
}

/**
 * One story in a section list: headline left, page number right, hairline
 * above, and the article's first paragraph below when it is given. A brief
 * page shows its name, the number of briefs next to the page number and the
 * first briefs below.
 */
export function HeadlineRow({
  title,
  page,
  onPress,
  paragraph,
  briefs,
  loading,
}: HeadlineRowProps) {
  const { colors, type, size, space } = useTheme();
  const card = briefs && !loading ? briefCardPlan(briefs, title) : null;
  const headline = card ? card.headline : title;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t.lists.openPage(card ? card.accessibilityLabel : title, page)}
      accessibilityState={loading ? { busy: true } : undefined}
      onPress={() => onPress(page)}
      style={({ pressed }) => ({
        minHeight: size.touch,
        paddingVertical: 10,
        gap: space['space-1'],
        borderTopWidth: 1,
        borderTopColor: colors.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space['space-4'] }}>
        <Text style={[type.styles.headline, { color: colors.ink, flex: 1 }, hyphenate]}>
          {headline}
        </Text>
        <Text
          style={[type.styles.meta, { color: colors['ink-muted'], fontVariant: ['tabular-nums'] }]}
        >
          {card ? `${card.count} · ${page}` : page}
        </Text>
      </View>
      {card ? (
        <BriefRows plan={card} />
      ) : (
        <FirstParagraph paragraph={paragraph} loading={loading} />
      )}
    </Pressable>
  );
}
