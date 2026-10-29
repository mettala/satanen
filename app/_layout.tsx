import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
  SchibstedGrotesk_700Bold,
  SchibstedGrotesk_800ExtraBold,
} from '@expo-google-fonts/schibsted-grotesk';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { useRefreshOnReturn } from '../src/feed/useRefreshOnReturn';
import { registerServiceWorker } from '../src/pwa/register';
import { settings } from '../src/storage';
import { ThemeProvider, useTheme } from '../src/theme';
import { AppColumn } from '../src/ui/AppColumn';

// Safari never settles expo-font's first document.fonts.load() call, so useFonts waits for its
// own 12 s timeout and the page stays blank. The fonts are plain @font-face rules, so the browser
// swaps them in by itself once they arrive: after this long we show the app regardless (web only;
// on phones text does not change font afterwards, so the apps keep waiting).
const FONT_WAIT_MS = 1500;

// Start reading the saved settings as soon as the app loads (ready() never rejects).
const settingsReady = settings.store.ready();

function ThemedStatusBar() {
  const { scheme } = useTheme();
  // Tells the browser the page's theme, so its own parts (scrollbars) match: no white strip in Tumma.
  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.style.colorScheme = scheme;
  }, [scheme]);
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  useEffect(registerServiceWorker, []);
  // Pages and lists on screen ask again when the reader comes back (D39 A).
  useRefreshOnReturn();
  // Tells the browser the text is Finnish, so it hyphenates long words properly.
  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.lang = 'fi';
  }, []);
  const [fontsLoaded, fontError] = useFonts({
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
    SchibstedGrotesk_800ExtraBold,
  });

  const [fontWaitOver, setFontWaitOver] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const timer = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  useEffect(() => {
    void settingsReady.then(() => setSettingsLoaded(true));
  }, []);

  if ((!fontsLoaded && !fontError && !fontWaitOver) || !settingsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AppColumn>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="[page]" />
          <Stack.Screen
            name="siirry"
            options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="valikko"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen name="asetukset" />
        </Stack>
      </AppColumn>
      <ThemedStatusBar />
    </ThemeProvider>
  );
}
