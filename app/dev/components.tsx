/**
 * Dev-only gallery (/dev/components) of the list building blocks: section
 * labels, lead card, headline rows, jump field and page header. Check it in
 * light and dark.
 */
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { t } from '../../src/i18n';
import { sectionOf } from '../../src/sections/sectionOf';
import { useTheme } from '../../src/theme';
import { HeadlineRow } from '../../src/ui/lists/HeadlineRow';
import { JumpField } from '../../src/ui/lists/JumpField';
import { LeadCard } from '../../src/ui/lists/LeadCard';
import { PageHeader } from '../../src/ui/lists/PageHeader';
import { SectionLabel } from '../../src/ui/lists/SectionLabel';

const SAMPLE_PAGES = [105, 131, 163, 201, 410, 310];

export default function ComponentsGallery() {
  const { colors, type, space } = useTheme();
  const [favourite, setFavourite] = useState(false);
  const [pressed, setPressed] = useState('');
  const press = (what: string | number) => setPressed(t.lists.galleryPressed(String(what)));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        page={105}
        favourite={favourite}
        onBack={() => press('back')}
        onToggleFavourite={() => setFavourite((f) => !f)}
      />
      <View style={{ padding: space['space-5'], gap: space['space-5'] }}>
        <Text style={[type.styles.title, { color: colors.ink }]}>{t.lists.galleryTitle}</Text>
        <Text style={[type.styles.meta, { color: colors['ink-muted'] }]}>{pressed}</Text>
        <JumpField onPress={() => press('jump')} />
        <LeadCard
          title="Hallitus esittää uutta energiatukea pienituloisille"
          page={105}
          ingress="Tuki maksettaisiin talven aikana kahdessa erässä. Esitys annetaan eduskunnalle ensi viikolla."
          onPress={press}
        />
        <View style={{ gap: space['space-3'] }}>
          {SAMPLE_PAGES.map((page) => {
            const s = sectionOf(page);
            return <SectionLabel key={page} section={s.id} label={s.label} suffix={page} />;
          })}
        </View>
        <View>
          <SectionLabel section="news" label={sectionOf(105).label} />
          <HeadlineRow title="Energiatuki kahdessa erässä" page={106} onPress={press} />
          <HeadlineRow
            title="Hyvin pitkä otsikko, joka jatkuu usealle riville ja kertoo kaiken tärkeän"
            page={107}
            onPress={press}
          />
          <HeadlineRow title="Lyhyt" page={108} onPress={press} />
          <HeadlineRow
            title="Yksi kuoli Jyväskylän palossa"
            page={105}
            paragraph="Jyväskylässä Hämeenkadulla tapahtuneessa kerrostalopalossa on kuollut yksi mies. Neljä ihmistä on toimitettu sairaalaan, kertoo Keski-Suomen pelastuslaitos."
            onPress={press}
          />
          <HeadlineRow
            title="Epäily: Jyväskylän palo tahallinen"
            page={110}
            loading
            onPress={press}
          />
        </View>
      </View>
    </ScrollView>
  );
}
