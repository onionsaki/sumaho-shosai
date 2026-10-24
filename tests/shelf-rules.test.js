import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterBooks, sortBooks } from '../src/core/search.js';
import { isStale } from '../src/core/stale.js';
import { ownedPriceSum, countOwned } from '../src/core/stats.js';
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
