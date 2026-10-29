import type { PageState } from '../../data/pageSource';

/**
 * True when a page has really been read, so it may go to "Viimeksi luetut":
 * a fresh copy arrived from the network. A saved copy shown while loading, an
 * old copy shown offline and an error all say no. (A page that turns out not
 * to exist first shows its saved copy, so counting that would record a 404.)
 */
export function shouldRecordRecent(
  state: Pick<PageState, 'status' | 'page' | 'refreshing' | 'reason' | 'offline'>,
): boolean {
  return (
    state.status === 'ready' &&
    state.page !== null &&
    !state.refreshing &&
    !state.offline &&
    state.reason === null
  );
}
