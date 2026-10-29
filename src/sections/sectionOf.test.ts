import { describe, expect, it } from 'vitest';
import { sectionOf } from './sectionOf';

describe('sectionOf', () => {
  it.each([
    [102, 'news', 'Kotimaa'],
    [105, 'news', 'Kotimaa'],
    [129, 'news', 'Kotimaa'],
    [130, 'world', 'Ulkomaat'],
    [159, 'world', 'Ulkomaat'],
    [160, 'business', 'Talous'],
    [189, 'business', 'Talous'],
    [200, 'sport', 'Urheilu'],
    [235, 'sport', 'Urheilu'],
    [299, 'sport', 'Urheilu'],
    [400, 'weather', 'Sää ja liikenne'],
    [499, 'weather', 'Sää ja liikenne'],
  ])('page %i is %s (%s)', (page, id, label) => {
    expect(sectionOf(page)).toEqual({ id, label });
  });

  it.each([
    [100, 'Uutiset'],
    [101, 'Uutiset'],
    [190, 'Uutiset'],
    [199, 'Uutiset'],
    [300, 'Ohjelmat'],
    [500, 'Alueet'],
    [600, 'Muut'],
    [700, 'Svenska'],
    [800, 'Viikkomakasiini'],
    [999, 'Muut'],
  ])('page %i is grey (%s)', (page, label) => {
    expect(sectionOf(page)).toEqual({ id: 'other', label });
  });
});
