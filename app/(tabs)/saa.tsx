import { useRouter } from 'expo-router';

import { t } from '../../src/i18n';
import { PageView } from '../../src/ui/page';

export default function WeatherScreen() {
  const router = useRouter();
  return (
    <PageView
      title={t.sectionTitles.weather}
      page={400}
      hideFooter
      onOpenPage={(p) => router.push(`/${p}`)}
      onReplacePage={(p) => router.replace(`/${p}`)}
      onHome={() => router.navigate('/')}
      onJump={() => router.push('/siirry')}
    />
  );
}
