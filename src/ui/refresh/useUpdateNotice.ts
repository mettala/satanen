import { useEffect, useState, useSyncExternalStore } from 'react';

import { createUpdateNotice, type UpdateNoticeState } from '../../data/updateNotice';
import type { Page } from '../../parser/model';

/** "Sivu päivitetty" for the page a screen shows (see `createUpdateNotice`). */
export function useUpdateNotice(page: Page | null): UpdateNoticeState {
  const [notice] = useState(() => createUpdateNotice());
  useEffect(() => notice.show(page), [notice, page]);
  useEffect(() => () => notice.dispose(), [notice]);
  return useSyncExternalStore(notice.subscribe, notice.getState, notice.getState);
}
