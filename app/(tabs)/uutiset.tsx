import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import type { FeedId } from '../../src/feed';
import { t } from '../../src/i18n';
import { FeedView, type FeedViewChip } from '../../src/ui/feed';

const CHIPS: readonly FeedViewChip[] = [
  { id: 'kotimaa', label: t.feed.sectionNames.news },
  { id: 'ulkomaat', label: t.feed.sectionNames.world },
];

// The chip last chosen, for as long as the app runs (the screen may be taken down meanwhile).
let lastChip: FeedId = 'kotimaa';

/** Uutiset: Kotimaa and Ulkomaat feeds, Kotimaa first, with chips Kotimaa · Ulkomaat. */
export default function NewsFeedScreen() {
  const router = useRouter();
  // `?chip=kotimaa|ulkomaat` comes from the ☰ menu and the jump sheet.
  const { chip } = useLocalSearchParams<{ chip?: string }>();
  const wanted = CHIPS.find((c) => c.id === chip)?.id;
  const [feed, setFeed] = useState<FeedId>(wanted ?? lastChip);
  useEffect(() => {
    lastChip = feed;
  }, [feed]);
  // A new `?chip=` from the menu switches the chip (adjusting state while rendering, not in an effect).
  const [seen, setSeen] = useState(wanted);
  if (wanted !== seen) {
    setSeen(wanted);
    if (wanted) setFeed(wanted);
  }
  return (
    <FeedView
      title={t.sectionTitles.news}
      feed={feed}
      chips={CHIPS}
      onSelectFeed={(id) => {
        setFeed(id);
      }}
      onOpen={(page, from) => router.push(`/${page}?feed=${from}`)}
      onJump={() => router.push('/siirry')}
    />
  );
}
