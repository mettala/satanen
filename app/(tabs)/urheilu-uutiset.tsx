import { useRouter } from 'expo-router';

import { t } from '../../src/i18n';
import { FeedView } from '../../src/ui/feed';

/** Urheilu-uutiset: the stories on page 201 as a feed, opened from the UUTISET button on Urheilu. */
export default function SportNewsScreen() {
  const router = useRouter();
  return (
    <FeedView
      title={t.feed.sportNews}
      feed="urheilu"
      onOpen={(page, from) => router.push(`/${page}?feed=${from}`)}
      onJump={() => router.push('/siirry')}
    />
  );
}
