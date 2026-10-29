import { useEffect } from 'react';

import { foreground, pageSource } from '../data';
import { watchForeground } from '../data/watchForeground';
import { connectRefreshOnReturn } from './refreshOnReturn';
import { feedStore } from './useFeed';

/** Once, in the root layout: the app asks again when the reader returns (D39 A). */
export function useRefreshOnReturn(): void {
  useEffect(() => {
    const off = connectRefreshOnReturn(foreground, pageSource, feedStore);
    const stop = watchForeground(foreground);
    return () => {
      stop();
      off();
    };
  }, []);
}
