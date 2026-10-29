import { Tabs } from 'expo-router';

import { BottomTabBar } from '../../src/ui/BottomTabBar';

// The bar itself lives in BottomTabBar so article pages and settings can show it too.
export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={() => <BottomTabBar />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="uutiset" />
      <Tabs.Screen name="urheilu" />
      <Tabs.Screen name="urheilu-uutiset" />
      <Tabs.Screen name="talous" />
      <Tabs.Screen name="saa" />
      <Tabs.Screen name="suosikit" />
    </Tabs>
  );
}
