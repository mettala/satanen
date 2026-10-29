import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ElementRef } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FAVOURITES_ENABLED } from '../../features';
import { t } from '../../i18n';
import { MENU_SECTIONS } from '../../sections/menu';
import { useTheme, type SectionId } from '../../theme';
import { LogoMark } from '../LogoMark';

const DRAWER_WIDTH = 312;
const DURATION = 220;
/** Wide enough for an 18 px icon; the section dots are centred in the same column. */
const ICON_COLUMN = 24;

export interface DrawerProps {
  /** Called after the slide-out animation when the drawer should go away. */
  onClose: () => void;
  onOpenPage: (page: number) => void;
  onOpenSettings: () => void;
  onOpenFavourites: () => void;
  onOpenRecent: () => void;
}

function Dot({ section }: { section: SectionId }) {
  const { colors, size } = useTheme();
  const color = colors[`section-${section}` as const];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: ICON_COLUMN, alignItems: 'center' }}
    >
      <View
        style={{
          width: size.dot,
          height: size.dot,
          borderRadius: size.dot / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/**
 * Left-hand menu over a dimmed screen. Slides in with the built-in Animated
 * API (D16). On web, focus moves into the drawer on open and back to the
 * element that opened it on close; Esc closes.
 */
export function Drawer({
  onClose,
  onOpenPage,
  onOpenSettings,
  onOpenFavourites,
  onOpenRecent,
}: DrawerProps) {
  const { colors, type, space, size } = useTheme();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const closeRef = useRef<ElementRef<typeof Pressable>>(null);
  const opener = useRef<unknown>(null);
  const panelRef = useRef<View>(null);
  const closing = useRef(false);

  const animateTo = (to: number, done?: () => void) =>
    Animated.timing(progress, {
      toValue: to,
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => done?.());

  const finish = (after: () => void) => {
    if (closing.current) return;
    closing.current = true;
    animateTo(0, () => {
      if (Platform.OS === 'web') {
        // The opener may be gone from the page; the ☰ button is the fallback.
        const target =
          (opener.current as HTMLElement | null)?.isConnected && opener.current !== document.body
            ? (opener.current as HTMLElement)
            : document.querySelector<HTMLElement>(`[aria-label="${t.a11y.menu}"]`);
        target?.focus?.();
      }
      after();
    });
  };

  // Keeps Tab inside the drawer: wraps from the last control to the first and back.
  const trapTab = (e: KeyboardEvent) => {
    const root = panelRef.current as unknown as HTMLElement | null;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>('a[href], button, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.tabIndex >= 0);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!root.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      opener.current = document.activeElement;
    }
    animateTo(1);
    if (Platform.OS === 'web') {
      (closeRef.current as unknown as { focus?: () => void } | null)?.focus?.();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') finish(onClose);
        if (e.key === 'Tab') trapTab(e);
      };
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space['space-3'],
    minHeight: size.touch,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: colors.scrim,
          opacity: progress,
        }}
      />
      <Animated.View
        ref={panelRef as never}
        accessibilityViewIsModal
        style={{
          width: DRAWER_WIDTH,
          maxWidth: '88%',
          backgroundColor: colors.surface,
          paddingTop: insets.top + space['space-3'],
          paddingBottom: insets.bottom + space['space-6'],
          paddingHorizontal: space['space-5'],
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-DRAWER_WIDTH, 0],
              }),
            },
          ],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: space['space-3'],
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-3'] }}>
            <LogoMark size={32} />
            <Text style={[type.styles.title, { color: colors.ink }]}>{t.common.appName}</Text>
          </View>
          <Pressable
            ref={closeRef}
            accessibilityRole="button"
            accessibilityLabel={t.a11y.closeDrawer}
            onPress={() => finish(onClose)}
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
        <ScrollView style={{ flex: 1 }}>
          {FAVOURITES_ENABLED ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t.drawer.favourites}
              onPress={() => finish(onOpenFavourites)}
              style={rowStyle}
            >
              <View style={{ width: ICON_COLUMN, alignItems: 'center' }}>
                <Ionicons name="star-outline" size={18} color={colors.ink} />
              </View>
              <Text
                style={[type.styles['body-sm'], { flex: 1, color: colors.ink, fontWeight: '500' }]}
              >
                {t.drawer.favourites}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t.drawer.recent}
            onPress={() => finish(onOpenRecent)}
            style={rowStyle}
          >
            <View style={{ width: ICON_COLUMN, alignItems: 'center' }}>
              <Ionicons name="time-outline" size={18} color={colors.ink} />
            </View>
            <Text
              style={[type.styles['body-sm'], { flex: 1, color: colors.ink, fontWeight: '500' }]}
            >
              {t.drawer.recent}
            </Text>
          </Pressable>
          {MENU_SECTIONS.map((s) => {
            const label = t.drawer.sections[s.key];
            return (
              <Pressable
                key={s.key}
                accessibilityRole="link"
                accessibilityLabel={t.lists.openPage(label, s.page)}
                onPress={() => finish(() => onOpenPage(s.page))}
                style={rowStyle}
              >
                <Dot section={s.section} />
                <Text
                  style={[
                    type.styles['body-sm'],
                    { flex: 1, color: colors.ink, fontWeight: '500' },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    type.styles.meta,
                    { color: colors['ink-muted'], fontVariant: ['tabular-nums'] },
                  ]}
                >
                  {s.page}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View
          style={{
            gap: space['space-2'],
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: space['space-3'],
          }}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t.drawer.settings}
            onPress={() => finish(onOpenSettings)}
            style={{ minHeight: size.touch, justifyContent: 'center' }}
          >
            <Text style={[type.styles['body-sm'], { color: colors.ink, fontWeight: '500' }]}>
              {t.drawer.settings}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.a11y.closeDrawer}
        // The dimmed area closes the drawer on click but is not a keyboard stop.
        focusable={false}
        onPress={() => finish(onClose)}
        style={{ flex: 1 }}
      />
    </View>
  );
}
