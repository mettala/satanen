import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Platform, RefreshControl, View } from 'react-native';

import { useTheme } from '../theme';
import { PULL_THRESHOLD, pullDistance, shouldRefresh } from './pullToRefresh';

export interface PullToRefresh {
  /** Pass to `refreshControl` of the list. Undefined on the web, which has its own gesture. */
  refreshControl: ReactElement | undefined;
  /** Pass to `ref` of the ScrollView / FlatList. Wires the gesture on the web. */
  attachTo: (list: unknown) => void;
  /** Render next to the list, inside a `flex: 1` parent. Null on phones' native build. */
  indicator: ReactElement | null;
}

type Cleanup = () => void;

/**
 * Pull down to refresh. On Android and iOS this is the system's RefreshControl.
 * react-native-web ignores RefreshControl, so on the web we watch touches on the
 * scroll element ourselves: pulling down from the very top and letting go refreshes.
 */
export function usePullToRefresh(refreshing: boolean, onRefresh: () => void): PullToRefresh {
  const { colors } = useTheme();
  const [pull, setPull] = useState(0);
  const latest = useRef(onRefresh);
  useEffect(() => {
    latest.current = onRefresh;
  });
  const cleanup = useRef<Cleanup | null>(null);
  // Kept here, not per attach, so a list that re-attaches mid-touch doesn't lose the pull.
  const gesture = useRef<{ startY: number | null; current: number }>({ startY: null, current: 0 });
  useEffect(() => () => cleanup.current?.(), []);

  const attachTo = useCallback((list: unknown) => {
    cleanup.current?.();
    cleanup.current = null;
    if (Platform.OS !== 'web' || !list) return;
    const l = list as { getScrollableNode?: () => unknown };
    const node = (l.getScrollableNode?.() ?? list) as HTMLElement;
    if (typeof node.addEventListener !== 'function') return;

    const g = gesture.current;
    const set = (v: number) => {
      g.current = v;
      setPull(v);
    };
    const onStart = (e: TouchEvent) => {
      g.startY = node.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (g.startY === null) return;
      const d = pullDistance(e.touches[0].clientY - g.startY, node.scrollTop);
      if (d > 0 && e.cancelable) e.preventDefault(); // no browser rubber band while pulling
      if (d !== g.current) set(d);
    };
    const onEnd = () => {
      if (g.startY === null) return;
      g.startY = null;
      const refresh = shouldRefresh(g.current);
      set(0);
      if (refresh) latest.current();
    };
    // Keep the browser's own reload-on-pull away from the list's top edge.
    node.style.overscrollBehaviorY = 'contain';
    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    cleanup.current = () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (Platform.OS !== 'web') {
    return {
      attachTo,
      indicator: null,
      refreshControl: (
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors['ink-muted']}
        />
      ),
    };
  }

  const shown = refreshing ? PULL_THRESHOLD : pull;
  const indicator =
    shown > 0 ? (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          alignItems: 'center',
          transform: [{ translateY: shown - 28 }],
          opacity: Math.min(1, shown / PULL_THRESHOLD),
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <ActivityIndicator
            size="small"
            color={colors['ink-muted']}
            animating={refreshing || pull >= PULL_THRESHOLD}
          />
        </View>
      </View>
    ) : null;
  return { attachTo, indicator, refreshControl: undefined };
}
