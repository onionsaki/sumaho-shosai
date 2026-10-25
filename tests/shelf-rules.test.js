import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterBooks, sortBooks } from '../src/core/search.js';
import { isStale } from '../src/core/stale.js';
import { ownedPriceSum, countOwned, tsundokuRate, floorTatami, ownedWithoutPrice } from '../src/core/stats.js';
import { newBook } from '../src/core/model.js';

const ctx = { examTagId: 'exam', staleYears: 2, today: '2026-10-24' };

test('search by reading in hiragana finds katakana reading', () => {
  const b = newBook({ title: 'ONE PIECE', titleKana: 'ワンピース' });
  assert.deepEqual(filterBooks([b], { query: 'わんぴーす' }, ctx), [b]);
  assert.deepEqual(filterBooks([b], { query: 'ｏｎｅ' }, ctx), [b]);
});

test('search covers authors, their reading, work title and memo', () => {
  const b = newBook({ title: 't', authors: ['渡邊康弘'], authorsKana: ['ワタナベヤスヒロ'], workTitle: '作品名', memo: '眉唾のため購入' });
  for (const q of ['渡邊', 'わたなべ', '作品', '眉唾']) assert.equal(filterBooks([b], { query: q }, ctx).length, 1, q);
});

test('terms are ANDed', () => {
  const b = newBook({ title: '簿記の教科書', memo: '試験直前に使う' });
  assert.equal(filterBooks([b], { query: '簿記 直前' }, ctx).length, 1);
  assert.equal(filterBooks([b], { query: '簿記　税法' }, ctx).length, 0);
});

test('empty filter returns everything', () => {
  const books = [newBook(), newBook({ ownership: 'released' })];
  assert.equal(filterBooks(books, {}, ctx).length, 2);
});

test('tag filter requires all tags', () => {
  const b = newBook({ tagIds: ['a', 'b'] });
  const c = newBook({ tagIds: ['a'] });
  assert.deepEqual(filterBooks([b, c], { tagIds: ['a', 'b'] }, ctx), [b]);
});

test('ownership, read status and needs-review filters', () => {
  const owned = newBook();
  const released = newBook({ ownership: 'released', readStatus: 'read' });
  const notFound = newBook({ lookup: 'not_found' });
  const all = [owned, released, notFound];
  assert.deepEqual(filterBooks(all, { ownership: ['released'] }, ctx), [released]);
  assert.deepEqual(filterBooks(all, { readStatus: ['read'] }, ctx), [released]);
  assert.deepEqual(filterBooks(all, { needsReviewOnly: true }, ctx), [notFound]);
});

test('stale filter', () => {
  const old = newBook({ tagIds: ['exam'], issued: '2021-04' });
  const recent = newBook({ tagIds: ['exam'], issued: '2026-03' });
  assert.deepEqual(filterBooks([old, recent], { staleOnly: true }, ctx), [old]);
});

test('kana sort orders by reading, then volume', () => {
  const v = n => newBook({ titleKana: 'ワンピース', volume: n });
  assert.deepEqual(sortBooks([v(10), v(2), v(1)], 'kana').map(b => b.volume), [1, 2, 10]);
  const a = newBook({ title: 'い', titleKana: 'イ' });
  const z = newBook({ title: 'あ', titleKana: '' }); // falls back to title
  assert.deepEqual(sortBooks([a, z], 'kana'), [z, a]);
});

test('recent sort is newest first and returns a new array', () => {
  const older = newBook({ createdAt: '2026-10-01T00:00:00Z' });
  const newer = newBook({ createdAt: '2026-10-20T00:00:00Z' });
  const input = [older, newer];
  assert.deepEqual(sortBooks(input, 'recent'), [newer, older]);
  assert.deepEqual(input, [older, newer]);
});

test('isStale', () => {
  const exam = issued => newBook({ tagIds: ['exam'], issued });
  assert.equal(isStale(exam('2023-09'), 'exam', 2, '2026-10-24'), true);
  assert.equal(isStale(exam('2025-04'), 'exam', 2, '2026-10-24'), false);
  assert.equal(isStale(exam('2024-10'), 'exam', 2, '2026-10-24'), true); // exactly 2 years
  assert.equal(isStale(exam('2024-11'), 'exam', 2, '2026-10-24'), false);
  assert.equal(isStale(exam('2024'), 'exam', 2, '2026-10-24'), true); // read as January
  assert.equal(isStale(exam(''), 'exam', 2, '2026-10-24'), false);
  assert.equal(isStale(newBook({ issued: '2010' }), 'exam', 2, '2026-10-24'), false); // no exam tag
  assert.equal(isStale(newBook({ tagIds: ['exam'], issued: '2010', ownership: 'released' }), 'exam', 2, '2026-10-24'), false);
});

test('ownedPriceSum and countOwned', () => {
  const books = [newBook({ price: 1400 }), newBook({ price: 500, ownership: 'released' }), newBook({ price: null }), newBook({ price: 700, format: 'ebook' })];
  assert.equal(ownedPriceSum(books), 2100);
  assert.equal(countOwned(books), 3);
});

test('積読率 counts owned paper books with the chosen tag', () => {
  const books = [
    newBook({ tagIds: ['tsun'] }), newBook({ tagIds: ['tsun'] }), newBook(), newBook(),
    newBook({ tagIds: ['tsun'], format: 'ebook' }), newBook({ tagIds: ['tsun'], ownership: 'not_owned' }),
  ];
  assert.deepEqual(tsundokuRate(books, 'tsun'), { count: 2, total: 4, percent: 50 });
  assert.equal(tsundokuRate(books, ''), null);
  assert.equal(tsundokuRate([], 'tsun'), null);
});

test('floor area: about 67 owned paper books to one 畳; books without a price are counted', () => {
  const books = Array.from({ length: 67 }, () => newBook({ price: null })).concat(newBook({ format: 'ebook', price: 500 }));
  assert.ok(Math.abs(floorTatami(books) - 1) < 0.02);
  assert.equal(ownedWithoutPrice(books), 67);
});

test('oldest sort is registration date ascending', () => {
  const older = newBook({ title: 'z', createdAt: '2026-01-01T00:00:00.000Z' });
  const newer = newBook({ title: 'b', createdAt: '2026-02-01T00:00:00.000Z' });
  assert.deepEqual(sortBooks([newer, older], 'oldest'), [older, newer]);
});

test('author sort uses the author reading, then the title', () => {
  const b1 = newBook({ title: 'い', authors: ['渡邉康弘'], authorsKana: ['ワタナベ ヤスヒロ'] });
  const b2 = newBook({ title: 'う', authors: ['齋藤孝'], authorsKana: ['サイトウ タカシ'] });
  const b3 = newBook({ title: 'あ', authors: ['渡邉康弘'], authorsKana: ['ワタナベ ヤスヒロ'] });
  assert.deepEqual(sortBooks([b1, b2, b3], 'author'), [b2, b3, b1]);
});

test('issued sorts put newer or older release first and unknown dates last', () => {
  const a = newBook({ title: 'a', issued: '2016-06' });
  const b = newBook({ title: '0', issued: '2020-01' });
  const none = newBook({ title: 'c', issued: '' });
  assert.deepEqual(sortBooks([a, none, b], 'issuedNew'), [b, a, none]);
  assert.deepEqual(sortBooks([b, none, a], 'issuedOld'), [a, b, none]);
});
