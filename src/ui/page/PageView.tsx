import { useEffect, useMemo, type ReactElement } from 'react';
import { ScrollView, View } from 'react-native';

import { isUpdatingDeviceCopy, usePage } from '../../data';
import { FAVOURITES_ENABLED } from '../../features';
import { chooseFooter, feedStore, pageHeadline } from '../../feed';
import { t } from '../../i18n';
import { pageStamp, toReaderBlocks } from '../../parser/blocks';
import { SPORT_FRONT_PAGE, sportFront } from '../../parser/sportFront';
import { classify } from '../../parser/classify';
import { assessPage } from '../../parser/confidence';
import { sectionOf } from '../../sections/sectionOf';
import { favourites, recent, useStored } from '../../storage';
import { useTheme } from '../../theme';
import { NextStoryCard } from '../feed/NextStoryCard';
import { feedSectionName } from '../feed/sectionName';
import { PageHeader } from '../lists/PageHeader';
import { SectionLabel } from '../lists/SectionLabel';
import { planSubpages } from '../reader/plan';
import { ReaderArticle } from '../reader/ReaderBlocks';
import { PageUpdatedNotice } from '../refresh/PageUpdatedNotice';
import { usePageInFront } from '../refresh/useInFront';
import { useUpdateNotice } from '../refresh/useUpdateNotice';
import { ArticleSkeleton, ErrorState, StaleNote, UpdatedMeta, type ErrorKind } from '../states';
import { clockTime, pageDateTime } from './format';
import { shouldRecordRecent } from './recordRecent';
import { usePullToRefresh } from '../usePullToRefresh';

export interface PageViewProps {
  /** A valid page number (100-899). */
  page: number;
  /** Big screen title on the left of the header (a section screen); an article has none. */
  title?: string;
  /** Leave out for a top-level screen (a tab): no back button. */
  onBack?: () => void;
  /** A section's own front page (Urheilu 200, Sää 400): no previous/next bar, the list is the way on. */
  hideFooter?: boolean;
  onOpenPage: (page: number) => void;
  /** Open a story's neighbour in the same list: replaces this article, no history step (D28). */
  onReplacePage: (page: number) => void;
  /** The list this article was opened from (`?feed=`), if any. */
  feed?: string;
  onHome: () => void;
  onJump: () => void;
}

const ERROR_KIND: Record<string, ErrorKind> = {
  'not-found': 'notFound',
  offline: 'offline',
  upstream: 'upstream',
  'bad-data': 'badData',
};

/** Looks up a neighbour page's headline (Yle's JSON gives only its number). */
function WithHeadline({
  page,
  children,
}: {
  page: number;
  children: (headline: string | undefined) => ReactElement;
}) {
  const { page: loaded } = usePage(page);
  const headline = useMemo(() => (loaded ? pageHeadline(loaded) : undefined), [loaded]);
  return children(headline);
}

/**
 * The bar above the bottom tabs for a page opened outside a list: the same card
 * as in a feed. Yle's JSON gives only the neighbours' numbers, so each title
 * comes from the neighbour's own page (fetched through the proxy, which caches
 * it); until it has loaded, or when the page has no headline, the card shows
 * "Sivu 200". The first and last page have no arrow on the missing side.
 */
function PageNeighbours({
  prev,
  next,
  onOpenPage,
}: {
  prev?: number;
  next?: number;
  onOpenPage: (page: number) => void;
}) {
  const { space } = useTheme();
  if (prev === undefined && next === undefined) return null;
  const render = (before?: string, after?: string) => (
    <View style={{ paddingHorizontal: space['space-1'], paddingBottom: space['space-6'] }}>
      <NextStoryCard
        previous={
          prev !== undefined
            ? {
                headline: before ?? t.article.pageFallback(prev),
                label: t.article.previousPageLabel(prev, before ?? t.article.pageFallback(prev)),
                onPress: () => onOpenPage(prev),
              }
            : undefined
        }
        next={
          next !== undefined
            ? {
                section: sectionOf(next).id,
                page: next,
                headline: after ?? t.article.pageFallback(next),
                label: t.article.nextPageLabel(next, after ?? t.article.pageFallback(next)),
                onPress: () => onOpenPage(next),
              }
            : undefined
        }
      />
    </View>
  );
  const withNext = (before?: string) =>
    next === undefined ? (
      render(before)
    ) : (
      <WithHeadline page={next}>{(after) => render(before, after)}</WithHeadline>
    );
  return prev === undefined ? (
    withNext()
  ) : (
    <WithHeadline page={prev}>{(before) => withNext(before)}</WithHeadline>
  );
}

/** One teletext page as a modern article, with header, states and footer. */
export function PageView({
  page: n,
  title,
  onBack,
  hideFooter,
  onOpenPage,
  onReplacePage,
  feed,
  onHome,
  onJump,
}: PageViewProps) {
  const { colors, space } = useTheme();
  const state = usePage(n);
  usePageInFront(n);
  // Quiet checks (the reader came back) show no spinner, nor does a device copy marked "Päivitetään…".
  const { attachTo, refreshControl, indicator } = usePullToRefresh(
    state.refreshing && !state.background && !state.fromDevice,
    () => void state.refresh(),
  );
  // A changed copy replaces the text at once (same ScrollView, so the place is kept).
  const notice = useUpdateNotice(state.page);
  const favs = useStored(favourites.store);
  // Read once per article: a list that changes meanwhile can't switch the footer or colour.
  const listed = useMemo(
    () => ({
      item: feed ? feedStore.itemOf(feed, n) : null,
      neighbours: feed ? feedStore.neighbours(feed, n) : null,
    }),
    [feed, n],
  );
  // Once per opening from a list: is this the story the list showed? (D39 C)
  useEffect(() => {
    if (feed) void feedStore.checkArticle(feed, n);
  }, [feed, n]);
  const own = sectionOf(n);
  // In a list, the item's section wins (661 in Urheilu is Urheilu, not grey).
  const section = listed.item
    ? { id: listed.item.section, label: feedSectionName(listed.item.section) }
    : own;
  const page = state.page;

  // Only a page that loaded from the network counts as read: not a saved copy
  // shown while loading (which a 404 then replaces), and not an error.
  const loadedOk = shouldRecordRecent(state);
  useEffect(() => {
    if (loadedOk) recent.add(n);
  }, [n, loadedOk]);

  // All subpages in one stream, so rows repeated on every subpage are kept.
  const parsed = useMemo(() => {
    if (!page) return null;
    const classified = classify(page);
    const raw = toReaderBlocks(page, classified, { keepRepeatedRows: true });
    const blocks = n === SPORT_FRONT_PAGE ? sportFront(raw, t.sport) : raw;
    return {
      plan: planSubpages(n, blocks, assessPage(classified)),
      // Yle's own "data from" line (`Rahastojen arvot 24.10. 20:40`), word for word.
      stamp: pageStamp(classified)?.text,
    };
  }, [n, page]);
  const plan = parsed?.plan ?? null;

  // The list was fixed when the article was opened; read once per article.
  const footer = useMemo(
    () =>
      chooseFooter(feed, n, () => listed.neighbours, {
        prevPage: page?.prevPage,
        nextPage: page?.nextPage,
      }),
    [feed, n, listed, page],
  );

  const notFound = state.status === 'error' && state.reason === 'not-found';
  let body;
  if (state.status === 'error') {
    body = (
      <ErrorState
        kind={ERROR_KIND[state.reason ?? ''] ?? 'upstream'}
        page={n}
        onHome={onHome}
        onJump={onJump}
        onRetry={() => void state.refresh()}
      />
    );
  } else if (!page || !plan) {
    body = <ArticleSkeleton label={t.states.loadingPage(n)} />;
  } else {
    const when = pageDateTime(page);
    const meta = state.updatedAt ? clockTime(state.updatedAt) : null;
    body = (
      <>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: space['space-6'],
            paddingTop: space['space-1'],
            paddingBottom: space['space-8'],
            gap: space['space-4'],
          }}
          ref={attachTo}
          refreshControl={refreshControl}
        >
          <SectionLabel
            section={section.id}
            label={section.label}
            suffix={parsed?.stamp ?? (when ? t.article.dateTime(when.date, when.time) : undefined)}
          />
          {isUpdatingDeviceCopy(state) ? (
            <UpdatedMeta time={meta ?? ''} updating />
          ) : state.offline && meta ? (
            <UpdatedMeta time={meta} offline />
          ) : null}
          {state.stale && meta ? <StaleNote time={meta} /> : null}
          <ReaderArticle page={n} plan={plan} handlers={{ onOpenPage }} />
        </ScrollView>
        {hideFooter ? null : footer.kind === 'story' ? (
          <View style={{ paddingHorizontal: space['space-1'], paddingBottom: space['space-6'] }}>
            <NextStoryCard
              previous={
                footer.previous
                  ? {
                      headline: footer.previous.headline,
                      onPress: () => onReplacePage(footer.previous!.page),
                    }
                  : undefined
              }
              next={
                footer.next
                  ? {
                      section: footer.next.section,
                      page: footer.next.page,
                      headline: footer.next.headline,
                      onPress: () => onReplacePage(footer.next!.page),
                    }
                  : undefined
              }
            />
          </View>
        ) : (
          <PageNeighbours prev={footer.prev} next={footer.next} onOpenPage={onOpenPage} />
        )}
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        page={n}
        title={title}
        favourite={favs.includes(n)}
        onBack={onBack}
        onJump={onJump}
        onToggleFavourite={notFound || !FAVOURITES_ENABLED ? undefined : () => favourites.toggle(n)}
      />
      <View style={{ flex: 1 }}>
        {body}
        {indicator}
        <PageUpdatedNotice visible={notice.visible && page !== null} count={notice.count} />
      </View>
    </View>
  );
}
