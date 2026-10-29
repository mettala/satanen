import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { reportOpened, shouldReportOpen } from '../src/api';
import { fi } from '../src/i18n/fi';
import { hasTab, hrefOfPage } from '../src/sections/destination';
import { isValidPage } from '../src/storage';
import { useTheme } from '../src/theme';
import { BottomTabBar } from '../src/ui/BottomTabBar';
import { PageHeader } from '../src/ui/lists/PageHeader';
import { PageView } from '../src/ui/page';
import { ErrorState } from '../src/ui/states';
import { useDocumentTitle } from '../src/ui/useDocumentTitle';

function parsePage(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{3}$/.test(value)) return null;
  const n = Number(value);
  return isValidPage(n) ? n : null;
}

export default function PageScreen() {
  const { page: param, feed: feedParam } = useLocalSearchParams<{ page: string; feed?: string }>();
  const feed = Array.isArray(feedParam) ? feedParam[0] : feedParam;
  const router = useRouter();
  const { colors } = useTheme();
  const n = parsePage(param);
  const opensOwnTab = n !== null && hasTab(n);
  useDocumentTitle(n !== null && !opensOwnTab ? fi.common.pageTitle(n) : null);

  // Page counts (D32): once each time a reader lands on a page (the effect
  // runs when the page number changes; going Back to a page already in the stack is
  // not a new visit). The rules for what counts are in `shouldReportOpen`.
  useEffect(() => {
    if (shouldReportOpen(n, opensOwnTab, __DEV__)) reportOpened(n);
  }, [n, opensOwnTab]);

  // Section indexes (100, 102, 130, 160, 201, 400) open as their tab, not as raw pages.
  if (n !== null && opensOwnTab) return <Redirect href={hrefOfPage(n) as never} />;

  const onHome = () => router.replace('/');
  const onJump = () => router.push('/siirry');
  const onBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // The page scrolls inside its own area; the bottom bar sits below it and never scrolls away.
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        {n === null ? (
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <PageHeader page={Number(param) || 0} onBack={onBack} onJump={onJump} />
            <ErrorState kind="notFound" page={Number(param) || 0} onHome={onHome} onJump={onJump} />
          </View>
        ) : (
          <PageView
            key={n}
            page={n}
            onBack={onBack}
            feed={feed}
            onOpenPage={(p) => router.push(`/${p}`)}
            onReplacePage={(p) =>
              router.replace(feed ? `/${p}?feed=${encodeURIComponent(feed)}` : `/${p}`)
            }
            onHome={onHome}
            onJump={onJump}
          />
        )}
      </View>
      <BottomTabBar />
    </View>
  );
}
