import { describe, expect, it } from 'vitest';

import type { Page } from '../../parser/model';
import { shouldRecordRecent } from './recordRecent';

const page = {} as Page;
const ok = { status: 'ready', page, refreshing: false, reason: null, offline: false } as const;

describe('shouldRecordRecent', () => {
  it('records a page that loaded fine', () => {
    expect(shouldRecordRecent(ok)).toBe(true);
  });
  it('does not record while loading or on an error', () => {
    expect(shouldRecordRecent({ ...ok, status: 'loading', page: null })).toBe(false);
    expect(shouldRecordRecent({ ...ok, status: 'error', page: null, reason: 'not-found' })).toBe(
      false,
    );
  });
  it('does not record a saved copy shown while the network is still being asked', () => {
    expect(shouldRecordRecent({ ...ok, refreshing: true })).toBe(false);
  });
  it('does not record an old copy shown offline', () => {
    expect(shouldRecordRecent({ ...ok, offline: true, reason: 'offline' })).toBe(false);
  });
});
