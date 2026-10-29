import { useRouter } from 'expo-router';

import { RecentView } from '../src/ui/recent/RecentView';

/** Recently read pages, opened from the ☰ menu or the jump sheet. */
export default function RecentScreen() {
  const router = useRouter();
  return (
    <RecentView
      onOpenPage={(p) => router.push(`/${p}`)}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
