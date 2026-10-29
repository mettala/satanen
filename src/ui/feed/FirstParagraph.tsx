import { Text, View } from 'react-native';

import { useTheme } from '../../theme';
import { clampedText } from '../clamp';
import { SkeletonBar as Bar } from '../states';

export interface FirstParagraphProps {
  /** First paragraph of the article, unchanged. Missing: nothing is shown. */
  paragraph?: string | null;
  /** The article is still loading: grey bars where the paragraph will go. */
  loading?: boolean;
}

/**
 * The "sneak peek" under a headline: the article's first paragraph, clamped
 * to 3 lines on screen (never cut in the text), or grey bars while it loads.
 * Shared by the feed items and Etusivu's headline rows.
 */
export function FirstParagraph({ paragraph, loading }: FirstParagraphProps) {
  const { colors, type, space } = useTheme();
  if (loading) {
    return (
      <View style={{ gap: space['space-2'], marginTop: space['space-1'] }}>
        <Bar height={14} />
        <Bar width="70%" height={14} />
      </View>
    );
  }
  if (!paragraph) return null;
  return (
    <Text
      numberOfLines={3}
      style={[type.styles['body-sm'], { color: colors['ink-muted'] }, clampedText]}
    >
      {paragraph}
    </Text>
  );
}
