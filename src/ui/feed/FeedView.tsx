import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Text,
  View,
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { feedStore, itemIngress, useFeed, type FeedId, type FeedItem as Item } from '../../feed';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import { PageHeader } from '../lists/PageHeader';
import { clockTime } from '../page/format';
import { useFeedInFront } from '../refresh/useInFront';
import { UpdateListButton } from '../refresh/UpdateListButton';
import { ErrorState, StaleNote } from '../states';
import { usePullToRefresh } from '../usePullToRefresh';
import { FeedChips } from './FeedChips';
import { FeedEnd } from './FeedEnd';
import { FeedItem } from './FeedItem';
import { FeedSkeleton } from './FeedSkeleton';
import { feedBody, feedErrorKind, onlyServices, restoreStep, visibleRange } from './feedRules';

/** Give up putting the list back after this long (rows that never measure, a short list). */
const RESTORE_GIVE_UP_MS = 1500;

export interface FeedViewChip {
  id: FeedId;
  label: string;
}

export interface FeedViewProps {
  /** Feed name in the header, e.g. "Uutiset". */
  title: string;
  /** The feed shown (the selected chip, if there are chips). */
  feed: FeedId;
  /** Kotimaa · Ulkomaat; leave out for a feed with no chips. */
  chips?: readonly FeedViewChip[];
  onSelectFeed?: (id: FeedId) => void;
  /** Opens a story; `feed` is the list it was opened from (D28). */
  onOpen: (page: number, feed: FeedId) => void;
  /** Opens the jump sheet from the header's `_ _ _`. */
  onJump?: () => void;
}

/** A news feed screen (DESIGN.md "News feeds"): header, chips, and the story list. */
export function FeedView({ title, feed, chips, onSelectFeed, onOpen, onJump }: FeedViewProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={title} onJump={onJump} />
      {chips ? (
        <FeedChips
          chips={chips}
          selected={feed}
          onSelect={(id) => {
            const chip = chips.find((c) => c.id === id);
            if (chip && onSelectFeed) onSelectFeed(chip.id);
          }}
        />
      ) : null}
      {/* Its own component per feed, so each chip keeps its own list and place. */}
      <FeedBody key={feed} id={feed} onOpen={onOpen} />
    </View>
  );
}

function FeedBody({ id, onOpen }: { id: FeedId; onOpen: FeedViewProps['onOpen'] }) {
  const state = useFeed(id);
  useFeedInFront(id);
  switch (feedBody(state)) {
    case 'skeleton':
      return <FeedSkeleton />;
    case 'error':
      return <ErrorState kind={feedErrorKind(state.reason)} onRetry={() => void state.refresh()} />;
    case 'empty':
      return <ErrorState kind="badData" onRetry={() => void state.refresh()} />;
    case 'list':
      return <FeedList id={id} onOpen={onOpen} />;
  }
}

const VIEWABILITY = { itemVisiblePercentThreshold: 10 };

function startRestore(id: FeedId) {
  const target = feedStore.scrollY(id);
  return { target, done: target <= 0, content: 0, viewport: 0 };
}

/**
 * The virtualised story list. It reports the items on screen to the store
 * (first paragraphs load for them, D26) and puts itself back at the saved
 * scroll position when it is drawn again (D27). A newer list that differs
 * waits behind "Päivitä lista" (D39 A); when the store replaces the list, it
 * goes back to the top.
 */
function FeedList({ id, onOpen }: { id: FeedId; onOpen: FeedViewProps['onOpen'] }) {
  const feed = useFeed(id);
  const { colors, space, type } = useTheme();
  const listRef = useRef<FlatList<Item> | null>(null);
  const { attachTo, refreshControl, indicator } = usePullToRefresh(
    feed.refreshing,
    () => void feed.refresh(),
  );

  // One stable ref function: a new one every render would re-attach the pull gesture mid-touch.
  const setList = useCallback(
    (list: FlatList<Item> | null) => {
      listRef.current = list;
      attachTo(list);
    },
    [attachTo],
  );

  // The saved place, read once when the list is first drawn; updated as it is restored.
  const [saved] = useState(() => startRestore(id));
  const restore = useRef(saved);
  // Draw at least down to the rows that were on screen, so the saved place fits at once.
  const [initialRows] = useState(() => Math.max(8, feedStore.visible(id).last + 3));

  const tryRestore = useCallback(() => {
    const r = restore.current;
    if (r.done) return;
    const step = restoreStep(r.target, r.content, r.viewport);
    listRef.current?.scrollToOffset({ offset: step.offset, animated: false });
    r.done = step.done;
  }, []);

  useEffect(() => {
    const r = restore.current;
    const timer = setTimeout(() => {
      r.done = true;
    }, RESTORE_GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, []);

  // A new list (pull to refresh, "Päivitä lista", back after a long time) starts at the top.
  const items = feed.items;
  const firstItems = useRef(items);
  useEffect(() => {
    if (items === firstItems.current) return;
    firstItems.current = items;
    restore.current.done = true;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [items]);

  // Coming back to the tab: make sure the list is where it was left.
  useFocusEffect(
    useCallback(() => {
      if (!restore.current.done) return;
      listRef.current?.scrollToOffset({ offset: feedStore.scrollY(id), animated: false });
    }, [id]),
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Until the list is back in place, its own jumps are not the reader's.
      if (restore.current.done) feedStore.setScrollY(id, e.nativeEvent.contentOffset.y);
    },
    [id],
  );

  // Stays the same for the list's life (the list is drawn again for another feed).
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: readonly { index?: number | null }[] }) => {
      const range = visibleRange(viewableItems.map((v) => v.index));
      if (range) feedStore.setVisible(id, range.first, range.last);
    },
    [id],
  );

  // Only service pages (Talous on a Sunday, D40): one line says there is no news.
  const noStories = onlyServices(feed.items);
  const open = useCallback((page: number) => onOpen(page, id), [onOpen, id]);
  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item, index }) => {
      const ing = itemIngress(feed, item.page);
      return (
        <FeedItem
          // The first story sits right under the chips (or under the no-news line).
          divider={index > 0 || noStories}
          section={item.section}
          page={item.page}
          headline={item.headline}
          paragraph={ing.kind === 'text' ? ing.text : null}
          briefs={ing.kind === 'briefs' ? ing : null}
          loading={ing.kind === 'loading'}
          onPress={open}
        />
      );
    },
    [feed, open, noStories],
  );

  const time = feed.updatedAt ? clockTime(feed.updatedAt) : null;
  const showStale = feed.stale && time !== null;
  const { applyUpdate } = feed;
  const onUpdate = useCallback(() => {
    applyUpdate();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [applyUpdate]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={setList}
        style={{ flex: 1 }}
        data={feed.items}
        extraData={feed.ingress}
        keyExtractor={(item) => String(item.page)}
        renderItem={renderItem}
        initialNumToRender={initialRows}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => {
          restore.current.done = true;
        }}
        onLayout={(e: LayoutChangeEvent) => {
          restore.current.viewport = e.nativeEvent.layout.height;
          tryRestore();
        }}
        onContentSizeChange={(_w, h) => {
          restore.current.content = h;
          tryRestore();
        }}
        refreshControl={refreshControl}
        contentContainerStyle={{
          paddingHorizontal: space['space-5'],
          paddingBottom: space['space-8'],
        }}
        ListHeaderComponent={
          showStale || noStories ? (
            <View style={{ paddingTop: space['space-2'], paddingBottom: space['space-3'] }}>
              {feed.stale && time ? <StaleNote time={time} /> : null}
              {noStories ? (
                <Text
                  style={[
                    type.styles.body,
                    { color: colors['ink-muted'], paddingTop: space['space-2'] },
                  ]}
                >
                  {t.feed.noBusinessNews}
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
        ListFooterComponent={time ? <FeedEnd time={time} offline={feed.offline} /> : undefined}
      />
      {indicator}
      {feed.hasUpdate ? <UpdateListButton onPress={onUpdate} /> : null}
    </View>
  );
}
