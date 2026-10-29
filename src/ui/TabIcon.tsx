import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type TabKey = 'home' | 'news' | 'sport' | 'business' | 'weather';

const ICONS: Record<TabKey, ComponentProps<typeof Ionicons>['name']> = {
  home: 'home-outline',
  news: 'newspaper-outline',
  sport: 'football-outline',
  business: 'trending-up-outline',
  weather: 'cloud-outline',
};

export function TabIcon({ tab, color }: { tab: TabKey; color: string }) {
  return <Ionicons name={ICONS[tab]} size={24} color={color} />;
}
