import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newerEditions, editionTitleKey, seriesVolume } from '../src/core/editions.js';

const rec = (isbn, issued, extra = {}) => ({ isbn, title: 'スッキリわかる日商簿記2級商業簿記', issued, pages: 400, edition: '', ...extra });

test('edition words and years in the title are ignored when matching', () => {
  const k = editionTitleKey('スッキリわかる日商簿記2級商業簿記');
  assert.equal(editionTitleKey('スッキリわかる日商簿記2級商業簿記 第15版'), k);
  assert.equal(editionTitleKey('スッキリわかる 日商簿記2級 商業簿記 2026年度版'), k);
  assert.equal(editionTitleKey('改訂新版 スッキリわかる日商簿記2級商業簿記'), k);
  assert.notEqual(editionTitleKey('スッキリわかる日商簿記3級'), k);
});

test('only records with the same title, another ISBN and a later date count, newest first', () => {
  const mine = rec('9784300110027', '2024-02');
  const items = [
    rec('9784300110027', '2024-02'),
    rec('9784300100028', '2022-03', { edition: '第14版' }),
    rec('9784300115725', '2025-02'),
    rec('9784300120620', '2026-02', { pages: 489 }),
    rec('9784813232544', '2027-01', { title: 'スッキリわかる日商簿記3級' }),
    rec('', '2026-05'),
  ];
  const out = newerEditions(mine, items);
  assert.deepEqual(out.map(i => i.isbn), ['9784300120620', '9784300115725']);
});

test('a book whose date is unknown still hears about every other edition', () => {
  const out = newerEditions(rec('9784300110027', ''), [rec('9784300120620', '2026-02'), rec('9784300110027', '2024-02')]);
  assert.deepEqual(out.map(i => i.isbn), ['9784300120620']);
});

test('the same ISBN returned twice is listed once', () => {
  const out = newerEditions(rec('1', '2020-01'), [rec('9784300120620', '2026-02'), rec('9784300120620', '2026-02', { edition: '第17版' })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].edition, '第17版');
});

test('another volume of a series is not taken for a new edition', () => {
  const mine = { isbn: '9784088725093', title: 'ONE PIECE', issued: '1997-12', volume: 1 };
  const items = [{ isbn: '9784088725109', title: 'ONE PIECE', issued: '1998-04', volume: 2 }];
  assert.deepEqual(newerEditions(mine, items), []);
});

test('「2024年度版」 in the volume field is an edition, not volume 2024', () => {
  const mine = rec('9784300110027', '2024-02', { volume: 2024, volumeLabel: '2024年度版' });
  const items = [rec('9784300120620', '2026-02', { volume: 2026, volumeLabel: '2026年度版' })];
  assert.deepEqual(newerEditions(mine, items).map(i => i.isbn), ['9784300120620']);
  assert.equal(seriesVolume(mine), null);
  assert.equal(seriesVolume({ volume: 3, volumeLabel: '3' }), 3);
});
