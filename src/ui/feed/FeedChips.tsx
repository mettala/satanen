import { Pressable, ScrollView, Text, View } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';

export interface FeedChip {
  id: string;
  label: string;
}

export interface FeedChipsProps {
  chips: readonly FeedChip[];
  selected: string;
  onSelect: (id: string) => void;
}

/** Kotimaa · Ulkomaat. Scrolls sideways when large text makes it too wide. */
export function FeedChips({ chips, selected, onSelect }: FeedChipsProps) {
  const { colors, type, size, space, radius } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A scroll view grows to fill its parent; the chip row takes only its own height.
      style={{ flexGrow: 0, flexShrink: 0 }}
      accessibilityRole="tablist"
      accessibilityLabel={t.feed.chipsLabel}
      contentContainerStyle={{
        paddingHorizontal: space['space-5'],
        paddingTop: space['space-1'],
        gap: space['space-2'],
      }}
    >
      {chips.map((chip) => {
        const isSelected = chip.id === selected;
        return (
          <Pressable
            key={chip.id}
            accessibilityRole="tab"
            accessibilityLabel={chip.label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(chip.id)}
            style={{ minHeight: size.touch, minWidth: size.touch, justifyContent: 'center' }}
          >
            <View
              style={{
                minHeight: 36,
                justifyContent: 'center',
                paddingHorizontal: space['space-3'],
                borderRadius: radius['radius-sm'],
                backgroundColor: isSelected ? colors.ink : colors.field,
              }}
            >
              <Text
                style={[type.styles['body-sm'], { color: isSelected ? colors.bg : colors.ink }]}
                numberOfLines={1}
              >
                {chip.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
