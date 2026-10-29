import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Text, View } from 'react-native';

import { UPDATED_NOTICE_MS } from '../../data/updateNotice';
import { t } from '../../i18n';
import { useTheme } from '../../theme';

/** Steps of the bar when the reader asked for less motion: one a second. */
const REDUCED_STEPS = 5;

export interface PageUpdatedNoticeProps {
  visible: boolean;
  /** Changes each time the message starts again (the bar starts over). */
  count: number;
}

/** The phone's or browser's "reduce motion" setting. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduce(value);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

/** The thin bar that runs down over the message's 5 seconds. */
function Countdown({ reduceMotion }: { reduceMotion: boolean }) {
  const { colors } = useTheme();
  const [left] = useState(() => new Animated.Value(1));
  const width = useMemo(
    () => left.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
    [left],
  );
  useEffect(() => {
    left.setValue(1);
    if (reduceMotion) {
      // Still shows the time running out, but in steps, not smoothly.
      let step = 0;
      const timer = setInterval(() => {
        step += 1;
        left.setValue(Math.max(0, 1 - step / REDUCED_STEPS));
      }, UPDATED_NOTICE_MS / REDUCED_STEPS);
      return () => clearInterval(timer);
    }
    const run = Animated.timing(left, {
      toValue: 0,
      duration: UPDATED_NOTICE_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [left, reduceMotion]);
  return (
    <View style={{ height: 3, backgroundColor: colors.line }}>
      <Animated.View
        style={{
          height: 3,
          backgroundColor: colors.ink,
          width,
        }}
      />
    </View>
  );
}

/**
 * "Sivu päivitetty" (D39 A, design/screens/11-paivitys.html): over the top of
 * a page whose text was just replaced, for 5 seconds. It takes no taps, so the
 * text underneath stays usable. Screen readers hear it once, politely: the
 * empty live region is always there, so adding the text is announced (web,
 * Android); iOS is told directly.
 */
export function PageUpdatedNotice({ visible, count }: PageUpdatedNoticeProps) {
  const { colors, type, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (!visible || Platform.OS !== 'ios') return;
    AccessibilityInfo.announceForAccessibilityWithOptions(t.refresh.pageUpdated, { queue: true });
  }, [visible, count]);

  return (
    <View
      pointerEvents="none"
      aria-live="polite"
      role="status"
      style={{
        position: 'absolute',
        top: space['space-2'],
        left: space['space-5'],
        right: space['space-5'],
      }}
    >
      {visible ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius['radius-md'],
            overflow: 'hidden',
          }}
        >
          <Text
            style={[
              type.styles['body-sm'],
              {
                color: colors.ink,
                fontFamily: 'SchibstedGrotesk_600SemiBold',
                paddingVertical: space['space-3'],
                paddingHorizontal: space['space-4'],
              },
            ]}
          >
            {t.refresh.pageUpdated}
          </Text>
          <Countdown key={count} reduceMotion={reduceMotion} />
        </View>
      ) : null}
    </View>
  );
}
