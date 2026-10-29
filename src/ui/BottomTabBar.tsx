import { useIsFocused, usePathname, useRouter } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n';
import { type as baseType, useTheme } from '../theme';
import { tabLabelScale } from '../theme/scale';
import { activeTab } from './activeTab';
import { TabBarLabel } from './TabBarLabel';
import { TabIcon } from './TabIcon';
import type { TabKey } from './TabIcon';

const BORDER_TOP_WIDTH = 1;
const ICON_BOX_HEIGHT = 28;
const ITEM_VERTICAL_PADDING = 10;

type ColorKey = 'section-news' | 'section-sport' | 'section-business' | 'section-weather';

interface Item {
  key: TabKey;
  label: string;
  href: string;
  color: ColorKey;
}

// Etusivu is page 100 as the front page (lead story and section groups); Uutiset is the
// Kotimaa + Ulkomaat feed. Which tab is highlighted: see activeTab.
const TAB_ITEMS: Item[] = [
  { key: 'home', label: t.tabs.home, href: '/', color: 'section-news' },
  { key: 'news', label: t.tabs.news, href: '/uutiset', color: 'section-news' },
  { key: 'sport', label: t.tabs.sport, href: '/urheilu', color: 'section-sport' },
  { key: 'business', label: t.tabs.business, href: '/talous', color: 'section-business' },
  { key: 'weather', label: t.tabs.weather, href: '/saa', color: 'section-weather' },
];

/** The bottom bar shown on every screen that shows a page. Active tab follows the URL. */
export function BottomTabBar() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // The tab screens keep their own bar mounted underneath an article; hide that copy
  // from screen readers so the tabs are not announced twice.
  const screenFocused = useIsFocused();
  const current = activeTab(pathname);
  const { colors, space, size } = theme;
  // On the web the theme's line height already follows the browser text size;
  // on phones the system font scale grows the label, so grow the bar with it.
  const { fontScale } = useWindowDimensions();
  const labelLineHeight =
    (baseType.styles.tab.lineHeight ?? 16) * tabLabelScale(Math.max(fontScale, theme.fontScale));
  const paddingTop = space['space-2'];
  const paddingBottom = space['space-5'] + insets.bottom;

  return (
    <View
      accessibilityRole="tablist"
      aria-hidden={!screenFocused}
      importantForAccessibility={screenFocused ? 'auto' : 'no-hide-descendants'}
      style={{
        flexDirection: 'row',
        backgroundColor: colors.bg,
        borderTopWidth: BORDER_TOP_WIDTH,
        borderTopColor: colors.line,
        paddingTop,
        paddingBottom,
        minHeight:
          BORDER_TOP_WIDTH +
          paddingTop +
          paddingBottom +
          ICON_BOX_HEIGHT +
          labelLineHeight +
          ITEM_VERTICAL_PADDING,
      }}
    >
      {TAB_ITEMS.map((item) => {
        const selected = item.key === current;
        const tint = selected ? colors[item.color] : colors['ink-muted'];
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => router.navigate(item.href as never)}
            style={{
              flex: 1,
              minHeight: size.touch,
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingHorizontal: space['space-1'],
            }}
          >
            <TabIcon tab={item.key} color={tint} />
            <TabBarLabel color={tint}>{item.label}</TabBarLabel>
          </Pressable>
        );
      })}
    </View>
  );
}
