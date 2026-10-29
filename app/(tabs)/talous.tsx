import { useRouter } from 'expo-router';

import { t } from '../../src/i18n';
import { FeedView } from '../../src/ui/feed';

/** Talous: the stories on page 160 as a feed. */
export default function BusinessScreen() {
  const router = useRouter();
  return (
    <FeedView
      title={t.sectionTitles.business}
      feed="talous"
      onOpen={(page, from) => router.push(`/${page}?feed=${from}`)}
      onJump={() => router.push('/siirry')}
    />
  );
}
