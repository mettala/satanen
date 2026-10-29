// Importing the storage module sets AsyncStorage as the device storage.
import '../storage';

export { foreground, pageSource, usePage, type UsePageResult } from './usePage';
export {
  LONG_AWAY_MS,
  pageLimitMs,
  TICK_MS,
  type Foreground,
  type ForegroundListener,
} from './freshness';
export { isUpdatingDeviceCopy, type PageSource, type PageState } from './pageSource';
export { clearSavedPages, MAX_SAVED_PAGES } from './pageCache';
