import { Redirect, useRouter } from 'expo-router';

import { FAVOURITES_ENABLED } from '../../src/features';
import { FavouritesView } from '../../src/ui/favourites/FavouritesView';

export default function FavouritesScreen() {
  const router = useRouter();
  // Switched off on the web (D37): an old link goes to Etusivu.
  if (!FAVOURITES_ENABLED) return <Redirect href="/" />;
  return <FavouritesView onOpenPage={(p) => router.push(`/${p}`)} />;
}
