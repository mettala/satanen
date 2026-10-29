import { describe, expect, it } from 'vitest';

import type { FrontPage } from '../front/frontPage';
import { chooseFooter, etusivuItems } from './footer';
import type { FeedItem } from './feedList';
import { createFeedStore } from './feedStore';
import type { PageSource } from '../data/pageSource';

const item = (page: number): FeedItem => ({ page, headline: `Juttu ${page}`, section: 'news' });
const yle = { prevPage: 106, nextPage: 130 };

const lookup = (id: string, page: number) =>
  id === 'uutiset'
    ? { previous: page === 105 ? null : item(105), next: page === 109 ? null : item(109) }
    : null;

describe('chooseFooter', () => {
  it('uses the story card for a known feed with the page in it', () => {
    expect(chooseFooter('uutiset', 108, lookup, yle)).toEqual({
      kind: 'story',
      previous: item(105),
      next: item(109),
    });
  });
  it('has no previous on the first and no next on the last item', () => {
    expect(chooseFooter('uutiset', 105, lookup, yle)).toMatchObject({ previous: null });
    expect(chooseFooter('uutiset', 109, lookup, yle)).toMatchObject({ next: null });
  });
  it('falls back to Yle page numbers without a feed, with an unknown id or no snapshot', () => {
    const pages = { kind: 'pages', prev: 106, next: 130 };
    expect(chooseFooter(undefined, 108, lookup, yle)).toEqual(pages);
    expect(chooseFooter('nonsense', 108, lookup, yle)).toEqual(pages);
    expect(chooseFooter('talous', 108, lookup, yle)).toEqual(pages);
  });
  it('drops neighbours that are not real pages: nothing after 899, nothing before 100', () => {
    expect(chooseFooter(undefined, 899, lookup, { prevPage: 898, nextPage: 900 })).toEqual({
      kind: 'pages',
      prev: 898,
      next: undefined,
    });
    expect(chooseFooter(undefined, 100, lookup, { nextPage: 101 })).toEqual({
      kind: 'pages',
      prev: undefined,
      next: 101,
    });
    expect(chooseFooter(undefined, 100, lookup, { prevPage: 99, nextPage: 101 })).toMatchObject({
      prev: undefined,
    });
  });
  it('falls back for a real store with no snapshot (reloaded page)', () => {
    const source = {} as PageSource;
    const store = createFeedStore({ source });
    expect(chooseFooter('uutiset', 108, store.neighbours, yle).kind).toBe('pages');
    expect(chooseFooter('etusivu', 108, store.neighbours, yle).kind).toBe('pages');
  });
  it('follows Etusivu order: lead, then grouped headlines', () => {
    const front: FrontPage = {
      lead: { page: 105, text: 'Johtava', section: 'news' },
      groups: [
        { section: 'world', headlines: [{ page: 131, text: 'Maailma', section: 'world' }] },
        { section: 'sport', headlines: [{ page: 201, text: 'Urheilu', section: 'sport' }] },
      ],
    };
    const store = createFeedStore({ source: {} as PageSource });
    store.registerList('etusivu', etusivuItems(front));
    expect(chooseFooter('etusivu', 105, store.neighbours, yle)).toMatchObject({
      kind: 'story',
      previous: null,
      next: { page: 131, headline: 'Maailma', section: 'world' },
    });
    expect(chooseFooter('etusivu', 201, store.neighbours, yle)).toMatchObject({ next: null });
  });
  it('gives the list item itself, with its own section', () => {
    const store = createFeedStore({ source: {} as PageSource });
    store.registerList('etusivu', [{ page: 673, headline: 'Peli', section: 'sport' }]);
    expect(store.itemOf('etusivu', 673)?.section).toBe('sport');
    expect(store.itemOf('etusivu', 100)).toBeNull();
    expect(store.itemOf('nonsense', 673)).toBeNull();
  });
});
