import { useRouter } from 'expo-router';

import { t } from '../../src/i18n';
import { PageView } from '../../src/ui/page';

/** Urheilu: page 200, the sports front (results and tables, with a button to the headlines). */
export default function SportScreen() {
  const router = useRouter();
  return (
    <PageView
      title={t.sectionTitles.sport}
      page={200}
      hideFooter
      onOpenPage={(p) => router.push(`/${p}`)}
      onReplacePage={(p) => router.replace(`/${p}`)}
      onHome={() => router.navigate('/')}
      onJump={() => router.push('/siirry')}
    />
  );
}
