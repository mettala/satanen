import { useRouter } from 'expo-router';

import { hrefOfPage } from '../src/sections/destination';
import { Drawer } from '../src/ui/drawer/Drawer';

/** The ☰ menu: a left drawer over a dimmed screen (D16). */
export default function DrawerScreen() {
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Drawer
      onClose={close}
      onOpenPage={(page) => router.replace(hrefOfPage(page) as never)}
      onOpenSettings={() => router.replace('/asetukset')}
      onOpenFavourites={() => router.replace('/suosikit')}
      onOpenRecent={() => router.replace('/viimeksi')}
    />
  );
}
