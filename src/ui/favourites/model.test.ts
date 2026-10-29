import { describe, expect, it } from 'vitest';

import { t } from '../../i18n';
import { isEditing, moveFlags, unavailableText } from './model';

describe('moveFlags', () => {
  it('first item cannot move up, last cannot move down', () => {
    expect(moveFlags(0, 4)).toEqual({ up: false, down: true });
    expect(moveFlags(2, 4)).toEqual({ up: true, down: true });
    expect(moveFlags(3, 4)).toEqual({ up: true, down: false });
  });
  it('a single item cannot move', () => {
    expect(moveFlags(0, 1)).toEqual({ up: false, down: false });
  });
});

describe('isEditing', () => {
  it('ends by itself when the list is empty', () => {
    expect(isEditing(true, 0)).toBe(false);
    expect(isEditing(true, 2)).toBe(true);
    expect(isEditing(false, 2)).toBe(false);
  });
});

describe('unavailableText', () => {
  it('names the problem', () => {
    expect(unavailableText('not-found')).toBe(t.states.notFoundTitle);
    expect(unavailableText('offline')).toBe(t.states.offlineTitle);
    expect(unavailableText('bad-data')).toBe(t.stateKit.badDataTitle);
    expect(unavailableText('upstream')).toBe(t.stateKit.upstreamTitle);
    expect(unavailableText(null)).toBe(t.stateKit.upstreamTitle);
  });
});

describe('favourite strings', () => {
  it('open label leaves out an empty headline', () => {
    expect(t.favouritesScreen.open('Kotimaa', 102, '')).toBe('Kotimaa 102');
    expect(t.favouritesScreen.open('Kotimaa', 102, 'Otsikko')).toBe('Otsikko, Kotimaa 102');
  });
});
