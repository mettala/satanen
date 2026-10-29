/** Dev-only gallery (/dev/feed): every state of the news feed building blocks, with mock data. */
import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { t } from '../../src/i18n';
import { useTheme } from '../../src/theme';
import { PageHeader } from '../../src/ui/lists/PageHeader';
import { FeedChips, FeedEnd, FeedItem, FeedSkeleton, NextStoryCard } from '../../src/ui/feed';

const CHIPS = [
  { id: 'all', label: t.feed.all },
  { id: 'kotimaa', label: t.feed.sectionNames.news },
  { id: 'ulkomaat', label: t.feed.sectionNames.world },
];

const PARAGRAPH =
  'Limingassa neljä ihmistä loukkaantui vakavasti, kun henkilöauto törmäsi liikenneopasteen tolppaan myöhään tiistaina. Asiasta kertoo Pohjois-Pohjanmaan pelastuslaitos. Auto oli matkalla Oulun suuntaan.';

/** 202 URHEILUSÄHKEET on 24.10.2026 (fixtures/pages/202.json). */
const BRIEFS = [
  {
    label: 'PESÄPALLO',
    text: 'Naisten Superpesiksen kaikkien aikojen lyöjäkuningatar Janette Lepistö jatkaa Lapuan Virkiässä ensi kaudella.',
  },
  {
    label: 'AM.JALKAPALLO',
    text: 'Suomi voitti Vantaalla Ison-Britannian 21-0 EM-lohkopelissään ja varmisti paikan vuonna 2027 pelattaviin neljän maan mitalipeleihin.',
  },
  {
    label: 'JALKAPALLO',
    text: 'Hyökkääjä David Ezeh on tehnyt kolmivuotisen sopimuksen Kuopion Palloseuran kanssa.',
  },
  {
    label: 'JÄÄKIEKKO',
    text: 'SM-liigan HPK tiedotti tehneensä loppukauden sopimuksen 36-vuotiaan hyökkääjän Mattias Tedenbyn kanssa.',
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, type, space } = useTheme();
  return (
    <View style={{ gap: space['space-2'] }}>
      <Text
        style={[
          type.styles.label,
          { color: colors['ink-muted'], paddingHorizontal: space['space-5'] },
        ]}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

export default function FeedGallery() {
  const { colors, type, space } = useTheme();
  const [chip, setChip] = useState('all');
  const [pressed, setPressed] = useState('');
  const press = (what: string | number) => setPressed(t.feed.devPressed(String(what)));
  const pad = { paddingHorizontal: space['space-5'] };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: space['space-8'], gap: space['space-8'] }}
    >
      <Section title={t.feed.devHeader}>
        <PageHeader title={t.lists.sections.news} />
        <Text style={[type.styles.meta, { color: colors['ink-muted'] }, pad]}>{pressed}</Text>
      </Section>
      <Section title={t.feed.devChips}>
        <FeedChips chips={CHIPS} selected={chip} onSelect={setChip} />
      </Section>
      <Section title={t.feed.devItems}>
        <View style={pad}>
          <FeedItem
            section="news"
            page={104}
            headline="Auto törmäsi tolppaan Limingassa"
            paragraph={PARAGRAPH}
            onPress={press}
          />
          <FeedItem
            section="world"
            page={131}
            headline="Hyvin pitkä otsikko, joka jatkuu usealle riville ja kertoo kaiken tärkeän"
            paragraph={PARAGRAPH}
            onPress={press}
          />
          <FeedItem
            section="business"
            page={162}
            headline="Pörssi nousi"
            paragraph="Lyhyt ingressi."
            onPress={press}
          />
          <FeedItem
            section="sport"
            page={661}
            headline="Sivu 661 Urheilun virrassa on vihreä"
            paragraph={PARAGRAPH}
            onPress={press}
          />
        </View>
      </Section>
      <Section title={t.feed.devItemLoading}>
        <View style={pad}>
          <FeedItem
            section="news"
            page={106}
            headline="HS-gallup: PS kirii kokoomusta"
            loading
            onPress={press}
          />
        </View>
      </Section>
      <Section title={t.feed.devItemHeadlineOnly}>
        <View style={pad}>
          <FeedItem section="news" page={107} headline="Vain otsikko saatavilla" onPress={press} />
        </View>
      </Section>
      <Section title={t.feed.devBriefs}>
        <View style={pad}>
          <FeedItem
            section="sport"
            page={202}
            headline="David Ezeh siirtyy HJK:sta KuPSiin"
            briefs={{ title: 'URHEILUSÄHKEET', briefs: BRIEFS }}
            onPress={press}
          />
          <FeedItem
            section="sport"
            page={202}
            headline="HPK pestasi Mattias Tedenbyn"
            briefs={{ title: 'URHEILUSÄHKEET', briefs: BRIEFS.slice(3) }}
            onPress={press}
          />
          <FeedItem
            section="sport"
            page={202}
            headline="Otsikko hakemistosta, kun sivun nimi puuttuu"
            briefs={{ briefs: BRIEFS.slice(0, 2) }}
            onPress={press}
          />
        </View>
      </Section>
      <Section title={t.feed.devSkeleton}>
        <FeedSkeleton />
      </Section>
      <Section title={t.feed.devEnd}>
        <View style={pad}>
          <FeedEnd time="14:32" />
        </View>
      </Section>
      <Section title={t.feed.devEndOffline}>
        <View style={pad}>
          <FeedEnd time="14:32" offline />
        </View>
      </Section>
      <Section title={t.feed.devNext}>
        <View style={pad}>
          <NextStoryCard
            previous={{
              headline: 'Auto törmäsi tolppaan Limingassa',
              onPress: () => press('prev'),
            }}
            next={{
              section: 'news',
              page: 106,
              headline: 'HS-gallup: PS kirii kokoomusta',
              onPress: () => press('next'),
            }}
          />
        </View>
      </Section>
      <Section title={t.feed.devNextOnly}>
        <View style={pad}>
          <NextStoryCard
            next={{
              section: 'business',
              page: 163,
              headline:
                'Hyvin pitkä otsikko joka ei mahdu kahdelle riville vaan leikkautuu kahden rivin jälkeen',
              onPress: () => press('next'),
            }}
          />
        </View>
      </Section>
      <Section title={t.feed.devLast}>
        <View style={pad}>
          <NextStoryCard previous={{ headline: 'Pörssi nousi', onPress: () => press('prev') }} />
        </View>
      </Section>
    </ScrollView>
  );
}
