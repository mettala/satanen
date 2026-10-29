import { Text, View } from 'react-native';

import { useSectionColor, useTheme, type SectionId } from '../../theme';
import { sectionLabelRows } from './sectionLabelRows';

export interface SectionLabelProps {
  section: SectionId;
  /** Section name; shown in capitals. */
  label: string;
  /** Optional second row: date and time, or page number. */
  suffix?: string | number;
}

/** Dot plus caps name in the section colour; date or page number on a second row. Not tappable. */
export function SectionLabel({ section, label, suffix }: SectionLabelProps) {
  const { type, size, space, colors } = useTheme();
  const color = useSectionColor(section);
  const rows = sectionLabelRows(label, suffix);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space['space-2'] }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: size.dot,
          height: size.dot,
          borderRadius: size.dot / 2,
          backgroundColor: color,
          // Pin the dot to the first line: centre it on that line's height.
          marginTop: Math.max(0, ((type.styles.label.lineHeight ?? size.dot) - size.dot) / 2),
          flexShrink: 0,
        }}
      />
      <View style={{ flexShrink: 1 }}>
        <Text style={[type.styles.label, { color, textTransform: 'uppercase' }]}>{rows.name}</Text>
        {rows.detail !== null ? (
          <Text
            style={[
              type.styles.meta,
              { color: colors['ink-muted'], fontVariant: ['tabular-nums'] },
            ]}
          >
            {rows.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
