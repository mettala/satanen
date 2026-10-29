import { describe, expect, it } from 'vitest';

import type { FeedItem } from '../../feed';
import { feedBody, feedErrorKind, onlyServices, restoreStep, visibleRange } from './feedRules';

const ITEM: FeedItem = { page: 105, headline: 'Yksi kuoli Jyväskylän palossa', section: 'news' };
const SERVICE: FeedItem = {
  page: 172,
  headline: 'Korot ja valuuttakurssit',
  section: 'business',
  service: true,
};

describe('feedBody', () => {
  it('shows the skeleton while the first list is built', () => {
    expect(feedBody({ status: 'loading', items: [] })).toBe('skeleton');
  });

  it('shows the error only when the store has no list at all', () => {
    expect(feedBody({ status: 'error', items: [] })).toBe('error');
  });

  it('shows the list when there are stories', () => {
    expect(feedBody({ status: 'ready', items: [ITEM] })).toBe('list');
  });

  it('says so when the index pages gave no stories', () => {
    expect(feedBody({ status: 'ready', items: [] })).toBe('empty');
  });

  it('shows the list when there are only service pages (Talous on a Sunday)', () => {
    expect(feedBody({ status: 'ready', items: [SERVICE] })).toBe('list');
  });
});

describe('onlyServices (D40)', () => {
  it('is true when every item is a service page', () => {
    expect(onlyServices([SERVICE, { ...SERVICE, page: 174 }])).toBe(true);
  });

  it('is false when there is a story, or no item at all', () => {
    expect(onlyServices([ITEM, SERVICE])).toBe(false);
    expect(onlyServices([ITEM])).toBe(false);
    expect(onlyServices([])).toBe(false);
  });
});

describe('feedErrorKind', () => {
  it('maps the page source reasons to error messages', () => {
    expect(feedErrorKind('offline')).toBe('offline');
    expect(feedErrorKind('bad-data')).toBe('badData');
    expect(feedErrorKind('upstream')).toBe('upstream');
    expect(feedErrorKind(null)).toBe('upstream');
  });

  it('treats a missing section index page as Yle not answering', () => {
    expect(feedErrorKind('not-found')).toBe('upstream');
  });
});

describe('visibleRange', () => {
  it('takes the smallest and largest index on screen', () => {
    expect(visibleRange([3, 4, 2, 5])).toEqual({ first: 2, last: 5 });
  });

  it('skips rows with no index', () => {
    expect(visibleRange([null, 7, undefined])).toEqual({ first: 7, last: 7 });
  });

  it('is null when nothing is on screen', () => {
    expect(visibleRange([])).toBeNull();
    expect(visibleRange([null])).toBeNull();
  });
});

describe('restoreStep', () => {
  it('has nothing to do at the top', () => {
    expect(restoreStep(0, 0, 0)).toEqual({ offset: 0, done: true });
  });

  it('scrolls as far as it can while the list is still shorter than the saved place', () => {
    expect(restoreStep(1500, 1200, 700)).toEqual({ offset: 500, done: false });
  });

  it('is done once the saved place fits', () => {
    expect(restoreStep(1500, 2400, 700)).toEqual({ offset: 1500, done: true });
  });

  it('waits for the list to be measured', () => {
    expect(restoreStep(300, 2400, 0)).toEqual({ offset: 300, done: false });
  });
});
