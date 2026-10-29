import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { t } from '../../i18n';
import { settings, useStored } from '../../storage';
import type { ThemeChoice } from '../../storage';
import { useTheme } from '../../theme';
import { PageHeader } from '../lists/PageHeader';

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: t.settings.themeSystem },
  { value: 'light', label: t.settings.themeLight },
  { value: 'dark', label: t.settings.themeDark },
];

function Heading({ children }: { children: string }) {
  const { colors, type, space } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        type.styles.meta,
        {
          color: colors['ink-muted'],
          marginTop: space['space-6'],
          marginBottom: space['space-2'],
          paddingHorizontal: space['space-5'],
        },
      ]}
    >
      {children}
    </Text>
  );
}

function Group({ children }: { children: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <View
      style={{
        marginHorizontal: space['space-4'],
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.line,
      }}
    >
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const { colors, type, size, space } = useTheme();
  const { theme: choice } = useStored(settings.store);
  const rowStyle = {
    minHeight: size.touch,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space['space-3'],
    paddingVertical: space['space-2'],
  };
  // The web app has no version for readers to care about (always the newest); the apps show it.
  const version = Platform.OS === 'web' ? undefined : Constants.expoConfig?.version;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t.settings.title} hideNumber />

      <ScrollView contentContainerStyle={{ paddingBottom: space['space-8'] }}>
        <Heading>{t.settings.themeHeading}</Heading>
        <Group>
          <View accessibilityRole="radiogroup">
            {THEME_OPTIONS.map((o) => {
              const selected = choice === o.value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityLabel={o.label}
                  accessibilityState={{ checked: selected }}
                  onPress={() => void settings.setTheme(o.value)}
                  style={rowStyle}
                >
                  <Text style={[type.styles.body, { color: colors.ink }]}>{o.label}</Text>
                  {selected ? <Ionicons name="checkmark" size={22} color={colors.ink} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Group>

        <Heading>{t.settings.contactHeading}</Heading>
        <Group>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t.settings.contactOpen}
            onPress={() => void Linking.openURL(`mailto:${t.settings.contactEmail}`)}
            style={rowStyle}
          >
            <Text style={[type.styles.body, { color: colors.ink }]}>
              {t.settings.contactPrompt}
              <Text style={{ textDecorationLine: 'underline' }}>{t.settings.contactEmail}</Text>
            </Text>
          </Pressable>
        </Group>

        <Heading>{t.settings.aboutHeading}</Heading>
        <Group>
          <View style={{ padding: space['space-3'], gap: space['space-2'] }}>
            <Text style={[type.styles.body, { color: colors.ink, fontWeight: '600' }]}>
              {t.common.attribution}
            </Text>
            <Text style={[type.styles['body-sm'], { color: colors['ink-muted'] }]}>
              {t.settings.independent}
            </Text>
            <Text style={[type.styles['body-sm'], { color: colors['ink-muted'] }]}>
              {t.settings.counts}
            </Text>
            {version ? (
              <Text style={[type.styles['body-sm'], { color: colors['ink-muted'] }]}>
                {t.settings.version(version)}
              </Text>
            ) : null}
          </View>
        </Group>
      </ScrollView>
    </View>
  );
}
