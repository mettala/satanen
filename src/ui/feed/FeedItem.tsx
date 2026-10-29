import { Platform, Pressable, Text, type TextStyle } from 'react-native';

import { useTheme, type SectionId } from '../../theme';
import { SectionLabel } from '../lists/SectionLabel';
import { BriefRows } from './BriefRows';
import { briefCardPlan, type BriefCardData } from './briefCard';
import { FirstParagraph } from './FirstParagraph';
import { feedSectionName } from './sectionName';

const hyphenate = (Platform.OS === 'web' ? { hyphens: 'auto' } : {}) as TextStyle;

export interface FeedItemProps {
  /** Section of the item (label and colour); not derived from the page number. */
  section: SectionId;
  page: number;
  headline: string;
  /** First paragraph of the article. Missing: headline only. */
  paragraph?: string | null;
  /**
   * The page is a brief page (D35): shown as a brief card, with the page's
   * own name, the number of briefs and the first three, instead of the
   * index headline and a paragraph.
   */
  briefs?: BriefCardData | null;
  /** The article is still loading: grey bars where the paragraph will go. */
  loading?: boolean;
  onPress: (page: number) => void;
  /** Hairline above the item; off for the first item under a line of its own. Default on. */
  divider?: boolean;
}

/**
 * One story in a feed: label, headline and the first paragraph, as one
 * pressable. A brief page becomes a brief card in the same layout.
 */
export function FeedItem({
  section,
  page,
  headline,
  paragraph,
  briefs,
  loading,
  onPress,
  divider = true,
}: FeedItemProps) {
  const { colors, type, size, space } = useTheme();
  const card = briefs && !loading ? briefCardPlan(briefs, headline) : null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={card ? card.accessibilityLabel : headline}
      accessibilityState={loading ? { busy: true } : undefined}
      onPress={() => onPress(page)}
      style={({ pressed }) => ({
        minHeight: size.touch,
        paddingVertical: space['space-4'],
        gap: space['space-2'],
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <SectionLabel
        section={section}
        label={feedSectionName(section)}
        suffix={card ? `${page} · ${card.count}` : page}
      />
      <Text style={[type.styles.title, { color: colors.ink }, hyphenate]}>
        {card ? card.headline : headline}
      </Text>
      {card ? (
        <BriefRows plan={card} />
      ) : (
        <FirstParagraph paragraph={paragraph} loading={loading} />
      )}
    </Pressable>
  );
}
