import { Text, View } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';
import type { BriefCardPlan } from './briefCard';

export interface BriefRowsProps {
  plan: Pick<BriefCardPlan, 'rows' | 'more'>;
}

/**
 * The body of a brief card (D35): up to 3 briefs, each its topic as Yle
 * prints it (`PESÄPALLO`) over its text clamped to one line on screen, with
 * hairlines between, and "Lue kaikki sähkeet ›" when there are more. Not
 * pressable itself: the whole card is one link to the page.
 */
export function BriefRows({ plan }: BriefRowsProps) {
  const { colors, type, space } = useTheme();
  const row = (first: boolean) => ({
    paddingVertical: space['space-2'],
    borderTopWidth: first ? 0 : 1,
    borderTopColor: colors.line,
  });
  return (
    <View>
      {plan.rows.map((brief, i) => (
        <View key={i} style={[row(i === 0), { gap: space['space-1'] }]}>
          <Text style={[type.styles.label, { color: colors.ink }]}>{brief.label}</Text>
          {brief.text ? (
            <Text
              numberOfLines={1}
              style={[type.styles['body-sm'], { color: colors['ink-muted'] }]}
            >
              {brief.text}
            </Text>
          ) : null}
        </View>
      ))}
      {plan.more ? (
        <View style={row(false)}>
          <Text style={[type.styles['body-sm'], { color: colors.link }]}>{t.feed.allBriefs}</Text>
        </View>
      ) : null}
    </View>
  );
}
