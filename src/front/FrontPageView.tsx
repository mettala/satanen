import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  FlatList,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { foreground, isUpdatingDeviceCopy, usePage } from '../data';
import { etusivuItems, feedStore, itemIngress, useListState } from '../feed';
import { createHeldList } from '../feed/heldList';
import type { ListStory } from '../feed/listUpdate';
import type { Page } from '../parser/model';
import { t } from '../i18n';
import { sectionOf } from '../sections/sectionOf';
import { useTheme } from '../theme';
import { Header } from '../ui/Header';
import { HeadlineRow } from '../ui/lists/HeadlineRow';
import { JumpField } from '../ui/lists/JumpField';
import { LeadCard } from '../ui/lists/LeadCard';
import { SectionLabel } from '../ui/lists/SectionLabel';
import { visibleRange } from '../ui/feed/feedRules';
import { clockTime } from '../ui/page/format';
import { usePageInFront } from '../ui/refresh/useInFront';
import { UpdateListButton } from '../ui/refresh/UpdateListButton';
import { ErrorState, FrontSkeleton, StaleNote, UpdatedMeta, type ErrorKind } from '../ui/states';
import { usePullToRefresh } from '../ui/usePullToRefresh';
import { frontPage } from './frontPage';
import { frontRows, type FrontRow } from './frontRows';

export const FRONT_PAGE = 100;

export interface FrontPageViewProps {
  onMenu: () => void;
  onJump: () => void;
  onOpenPage: (page: number) => void;
}

const ERROR_KIND: Record<string, ErrorKind> = {
  offline: 'offline',
  'bad-data': 'badData',
};

const VIEWABILITY = { itemVisiblePercentThreshold: 10 };

/** Etusivu's stories in reading order, to compare two copies of page 100 (D39 A). */
const storiesCache = new WeakMap<Page, readonly ListStory[]>();
function frontStories(page: Page): readonly ListStory[] {
  let stories = storiesCache.get(page);
  if (!stories) {
    stories = etusivuItems(frontPage(page));
    storiesCache.set(page, stories);
  }
  return stories;
}

/** Reports the rows on screen: first paragraphs load for them + 6 (D26). */
function onViewableItemsChanged({
  viewableItems,
}: {
  viewableItems: readonly { item?: FrontRow }[];
}) {
  const range = visibleRange(viewableItems.map((v) => v.item?.index));
  if (range) feedStore.setVisible('etusivu', range.first, range.last);
}

/**
 * Page 100 as a news front page. A new copy of page 100 doesn't move the list
 * under the reader's finger (D39 A): it is held by `createHeldList` and shown
 * at the top, after a long time away, or with "Päivitä lista".
 */
export function FrontPageView({ onMenu, onJump, onOpenPage }: FrontPageViewProps) {
  const { colors, space } = useTheme();
  const state = usePage(FRONT_PAGE);
  usePageInFront(FRONT_PAGE);
  const [held] = useState(() => createHeldList<Page>(frontStories));
  const heldState = useSyncExternalStore(held.subscribe, held.getState, held.getState);
  useEffect(() => {
    if (state.page) held.offer(state.page);
  }, [held, state.page]);
  useEffect(() => foreground.subscribe((awayMs) => held.noteAway(awayMs)), [held]);
  // Until the first copy is held (the effect above), show what the page source has.
  const page = heldState.shown ?? state.page;
  const front = useMemo(() => (page ? frontPage(page) : null), [page]);
  const updated = state.updatedAt ? clockTime(state.updatedAt) : null;
  // Quiet checks (the reader came back) show no spinner, nor does a device copy marked "Päivitetään…".
  const { attachTo, refreshControl, indicator } = usePullToRefresh(
    state.refreshing && !state.background && !state.fromDevice,
    () => void state.refresh(),
  );
  const listRef = useRef<FlatList<FrontRow> | null>(null);
  // One stable ref function: a new one every render would re-attach the pull gesture mid-touch.
  const setList = useCallback(
    (list: FlatList<FrontRow> | null) => {
      listRef.current = list;
      attachTo(list);
    },
    [attachTo],
  );
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => held.setScrollY(e.nativeEvent.contentOffset.y),
    [held],
  );
  // A replaced list (back after a long time, "Päivitä lista") starts at the top.
  const replaced = heldState.replaced;
  useEffect(() => {
    if (replaced > 0) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [replaced]);
  const onUpdate = useCallback(() => {
    held.apply();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [held]);
  const rows = useMemo(() => (front ? frontRows(front) : []), [front]);
  // First paragraphs under the lead and every headline, loaded by the feed store.
  const list = useListState('etusivu');

  // Articles opened from here take their next story from this order (D28),
  // and the store loads the first paragraphs in it.
  const pageTimeMs = state.updatedAt?.getTime() ?? null;
  useEffect(() => {
    if (!front?.lead) return;
    const at = pageTimeMs === null ? null : new Date(pageTimeMs);
    feedStore.registerList('etusivu', etusivuItems(front), at);
  }, [front, pageTimeMs]);

  const renderRow = useCallback<ListRenderItem<FrontRow>>(
    ({ item: row }) => {
      const gap = space['space-5'] - 2;
      if (row.kind === 'label') {
        return (
          <View style={{ marginTop: gap }}>
            <SectionLabel section={row.section} label={sectionOf(row.page).label} />
          </View>
        );
      }
      const ing = itemIngress(list, row.headline.page);
      const paragraph = ing.kind === 'text' ? ing.text : undefined;
      const briefs = ing.kind === 'briefs' ? ing : null;
      if (row.kind === 'lead') {
        return (
          <LeadCard
            title={row.headline.text}
            page={row.headline.page}
            ingress={paragraph}
            ingressLoading={ing.kind === 'loading'}
            briefs={briefs}
            onPress={onOpenPage}
          />
        );
      }
      return (
        <View style={{ marginTop: space['space-1'] }}>
          <HeadlineRow
            title={row.headline.text}
            page={row.headline.page}
            paragraph={paragraph}
            briefs={briefs}
            loading={ing.kind === 'loading'}
            onPress={onOpenPage}
          />
        </View>
      );
    },
    [list, onOpenPage, space],
  );

  let body;
  if (state.status === 'error' || (front && !front.lead)) {
    body = (
      <ErrorState
        kind={state.status === 'error' ? (ERROR_KIND[state.reason ?? ''] ?? 'upstream') : 'badData'}
        onRetry={() => void state.refresh()}
      />
    );
  } else if (!front || !front.lead) {
    body = <FrontSkeleton label={t.front.loading} />;
  } else {
    body = (
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        extraData={list.ingress}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY}
        contentContainerStyle={{
          paddingHorizontal: space['space-5'],
          paddingTop: space['space-1'],
          paddingBottom: space['space-8'],
        }}
        ListHeaderComponent={
          isUpdatingDeviceCopy(state) ? (
            <View style={{ marginBottom: space['space-5'] - 2 }}>
              <UpdatedMeta time={updated ?? ''} updating />
            </View>
          ) : (state.offline || state.stale) && updated ? (
            <View style={{ marginBottom: space['space-5'] - 2, gap: space['space-2'] }}>
              {state.offline ? <UpdatedMeta time={updated} offline /> : null}
              {state.stale ? <StaleNote time={updated} /> : null}
            </View>
          ) : undefined
        }
        onScroll={onScroll}
        scrollEventThrottle={32}
        ref={setList}
        refreshControl={refreshControl}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header onMenu={onMenu} />
      <View style={{ paddingHorizontal: space['space-5'], paddingBottom: space['space-2'] }}>
        <JumpField onPress={onJump} />
      </View>
      <View style={{ flex: 1 }}>
        {body}
        {indicator}
        {heldState.hasUpdate && front?.lead ? <UpdateListButton onPress={onUpdate} /> : null}
      </View>
    </View>
  );
}
