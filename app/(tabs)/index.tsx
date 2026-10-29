import { useRouter } from 'expo-router';

import { FrontPageView } from '../../src/front/FrontPageView';

export default function FrontPageScreen() {
  const router = useRouter();
  return (
    <FrontPageView
      onMenu={() => router.push('/valikko')}
      onJump={() => router.push('/siirry')}
      onOpenPage={(p) => router.push(`/${p}?feed=etusivu`)}
    />
  );
}
