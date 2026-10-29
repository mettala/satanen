import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { useTheme } from '../../theme';
import { MenuButton } from '../MenuButton';

export interface PageHeaderProps {
  /** A Yle page number. Leave out on a screen Satanen makes itself: it shows "_ _ _" instead. */
  page?: number;
  favourite?: boolean;
  /** Leave out for a top-level screen (a tab): no back button is shown. */
  onBack?: () => void;
  /** Makes the page number a button that opens the jump sheet. */
  onJump?: () => void;
  /** Screen name on the left (e.g. "Uutiset"); a Yle page has none. */
  title?: string;
  /** Leave out the number slot altogether (Asetukset). */
  hideNumber?: boolean;
  /** Extra control before the page number (e.g. "Muokkaa"). */
  trailing?: ReactNode;
  /** Leave out to hide the star (a page that does not exist, or a screen with no page number). */
  onToggleFavourite?: () => void;
}

/**
 * Header of every screen but the front page: ☰ · ‹ Takaisin · name · page number · favourite star.
 * A screen Satanen makes itself has no Yle page number and shows "_ _ _" in its place.
 */
export function PageHeader({
  page,
  favourite = false,
  onBack,
  onJump,
  title,
  trailing,
  hideNumber = false,
  onToggleFavourite,
}: PageHeaderProps) {
  const { colors, type, size, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const button = {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
  const numberStyle = [
    type.styles.headline,
    { color: colors.ink, fontVariant: ['tabular-nums'] as const },
  ];
  const numberText =
    page === undefined ? (
      <Text accessible={false} style={numberStyle}>
        {t.lists.noPageNumber}
      </Text>
    ) : (
      <Text
        accessibilityRole={onJump ? undefined : 'header'}
        accessibilityLabel={t.lists.pageHeaderTitle(page)}
        style={numberStyle}
      >
        {page}
      </Text>
    );
  // The number sits in a rounded chip like the next-story card. It opens the jump sheet
  // when `onJump` is given, also on a screen with no page number (`_ _ _`).
  const chip = {
    minHeight: size.touch,
    minWidth: size.touch,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space['space-4'],
    borderRadius: radius['radius-lg'],
    backgroundColor: colors.surface,
  } as const;
  const numberView = onJump ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        page === undefined ? t.lists.jumpFromNoNumber : t.lists.jumpFromHeader(page)
      }
      onPress={onJump}
      style={({ pressed }) => [chip, { opacity: pressed ? 0.6 : 1 }]}
    >
      {numberText}
    </Pressable>
  ) : (
    <View style={chip}>{numberText}</View>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: insets.top + space['space-2'],
        paddingHorizontal: space['space-2'],
        paddingBottom: space['space-2'],
      }}
    >
      <MenuButton />
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.a11y.back}
          onPress={onBack}
          style={{
            minHeight: size.touch,
            flexShrink: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingRight: space['space-2'],
          }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
          <Text style={[type.styles['body-sm'], { color: colors.ink, flexShrink: 1 }]}>
            {t.a11y.back}
          </Text>
        </Pressable>
      ) : null}
      {title ? (
        <Text
          accessibilityRole="header"
          style={[type.styles.title, { color: colors.ink, flexShrink: 1 }]}
        >
          {title}
        </Text>
      ) : null}
      {/* The free width, so the number and star stay at the right edge. */}
      <View style={{ flexGrow: 1 }} />
      {trailing}
      {hideNumber ? null : numberView}
      {onToggleFavourite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favourite ? t.a11y.removeFavourite : t.a11y.addFavourite}
          accessibilityState={{ selected: favourite }}
          onPress={onToggleFavourite}
          style={button}
        >
          <Ionicons name={favourite ? 'star' : 'star-outline'} size={22} color={colors.ink} />
        </Pressable>
      ) : hideNumber ? null : (
        <View style={button} />
      )}
    </View>
  );
}
