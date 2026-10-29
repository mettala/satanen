import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { buildJumpModel, cleanDigits, type JumpRow } from '../../jump/model';
import { useSectionColor, useTheme } from '../../theme';

export interface JumpSheetProps {
  favourites: readonly number[];
  /** Called with a page number when the user picks a row or types 3 valid digits. */
  onOpenPage: (page: number) => void;
  onClose: () => void;
  /** Opens the list of recently read pages; the link is hidden when left out. */
  onOpenRecent?: () => void;
  /** Rounds the bottom corners too, for a sheet that does not touch the bottom edge. */
  floating?: boolean;
}

function Row({ row, onPress }: { row: JumpRow; onPress: (page: number) => void }) {
  const { colors, type, size, space } = useTheme();
  const dot = useSectionColor(row.sectionId);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t.jumpSheet.openRow(row.code, row.title)}
      onPress={() => onPress(row.page)}
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
        numberOfLines={1}
        style={[
          type.styles['body-sm'],
          {
            minWidth: 44,
            flexShrink: 0,
            color: colors.ink,
            fontVariant: ['tabular-nums'],
          },
        ]}
      >
        {row.code}
      </Text>
      <Text style={[type.styles.headline, { flex: 1, color: colors.ink }]}>{row.title}</Text>
      {row.range ? (
        <Text style={[type.styles.meta, { color: colors['ink-muted'], flexShrink: 0 }]}>
          {row.range}
        </Text>
      ) : (
        <View
          style={{
            width: size.dot,
            height: size.dot,
            borderRadius: size.dot / 2,
            backgroundColor: dot,
            marginRight: space['space-1'],
          }}
        />
      )}
    </Pressable>
  );
}

/** The "Siirry sivulle" sheet: number field, then categories and favourites, or suggestions. */
export function JumpSheet({
  favourites,
  onOpenPage,
  onClose,
  onOpenRecent,
  floating = false,
}: JumpSheetProps) {
  const { colors, type, radius, size, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const model = buildJumpModel(text, favourites);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onChange = (value: string) => {
    const digits = cleanDigits(value);
    setText(digits);
    const next = buildJumpModel(digits, favourites);
    if (next.status === 'jump') onOpenPage(next.page);
  };

  const invalid = model.status === 'invalid';
  const fieldText = [
    type.styles.title,
    { letterSpacing: 3, fontVariant: ['tabular-nums' as const] },
  ];
  const caption = (title: string) => (
    <Text
      accessibilityRole="header"
      style={[
        type.styles.label,
        {
          color: colors['ink-muted'],
          textTransform: 'uppercase',
          paddingTop: space['space-3'],
          paddingBottom: 4,
        },
      ]}
    >
      {title}
    </Text>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius['radius-lg'],
        borderTopRightRadius: radius['radius-lg'],
        borderBottomLeftRadius: floating ? radius['radius-lg'] : 0,
        borderBottomRightRadius: floating ? radius['radius-lg'] : 0,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: space['space-3'],
          paddingLeft: space['space-5'],
          paddingRight: space['space-2'],
        }}
      >
        <Text
          accessibilityRole="header"
          style={[type.styles.title, { flex: 1, color: colors.ink }]}
        >
          {t.jumpSheet.title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.a11y.closeJump}
          onPress={onClose}
          style={{
            width: size.touch,
            height: size.touch,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={24} color={colors.ink} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: space['space-5'], paddingTop: space['space-2'] }}>
        <View>
          <TextInput
            autoFocus
            value={text}
            onChangeText={onChange}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={3}
            accessibilityLabel={t.jumpSheet.inputLabel}
            // The typed digits are drawn by the overlay below, with the blanks still showing.
            selectionColor={colors.focus}
            cursorColor={colors.ink}
            style={[
              fieldText,
              {
                minHeight: size.touch + space['space-2'],
                borderRadius: radius['radius-md'],
                backgroundColor: colors.field,
                borderWidth: 2,
                borderColor: invalid ? colors.danger : colors.focus,
                paddingHorizontal: space['space-4'],
                color: 'transparent',
              },
              Platform.OS === 'web'
                ? ({ outlineStyle: 'none', caretColor: colors.ink } as object)
                : null,
            ]}
          />
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              StyleSheet.absoluteFill,
              { justifyContent: 'center', paddingHorizontal: space['space-4'] + 2 },
            ]}
          >
            <Text style={[fieldText, { color: colors.ink }]}>
              {text}
              <Text style={{ color: colors['ink-muted'] }}>
                {t.jumpSheet.blank.repeat(3 - text.length)}
              </Text>
            </Text>
          </View>
        </View>
        {invalid ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[type.styles['body-sm'], { color: colors.danger, paddingTop: 8 }]}
          >
            {t.jumpSheet.outOfRange}
          </Text>
        ) : null}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: space['space-5'],
          paddingBottom: insets.bottom + space['space-4'],
        }}
      >
        {model.status === 'empty' && onOpenRecent ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t.drawer.recent}
            onPress={onOpenRecent}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space['space-3'],
              minHeight: size.touch,
              marginTop: space['space-3'],
            }}
          >
            <Ionicons name="time-outline" size={20} color={colors.ink} />
            <Text style={[type.styles.headline, { flex: 1, color: colors.ink }]}>
              {t.drawer.recent}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors['ink-muted']} />
          </Pressable>
        ) : null}
        {model.groups.map((group) => (
          <View key={group.key}>
            {caption(group.title)}
            {group.rows.map((row) => (
              <Row key={row.key} row={row} onPress={onOpenPage} />
            ))}
          </View>
        ))}
        {model.status === 'empty' && model.groups.length === 0 ? (
          <Text
            style={[
              type.styles['body-sm'],
              { color: colors['ink-muted'], paddingTop: space['space-4'] },
            ]}
          >
            {t.jumpSheet.emptyHint}
          </Text>
        ) : null}
        {model.status === 'typing' && model.groups.length === 0 ? (
          <Text
            style={[
              type.styles['body-sm'],
              { color: colors['ink-muted'], paddingTop: space['space-4'] },
            ]}
          >
            {t.jumpSheet.noMatches}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
