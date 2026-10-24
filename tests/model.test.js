import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBook, todayStr, SEED_TAGS, LABELS } from '../src/core/model.js';

test('newBook omits isbn when empty and fills defaults', () => {
  const b = newBook({ isbn: '' });
  assert.equal('isbn' in b, false);
  assert.equal(b.ownership, 'owned');
  assert.equal(b.readStatus, 'unread');
  assert.equal(b.format, 'paper');
  assert.equal(b.lookup, 'manual');
  assert.deepEqual(b.tagIds, []);
  assert.equal(b.pages, null);
  assert.equal(typeof b.id, 'string');
  assert.equal(b.createdAt, b.updatedAt);
});

test('newBook keeps given values', () => {
  const b = newBook({ isbn: '9784763135476', title: 'x', tagIds: ['a'] });
  assert.equal(b.isbn, '9784763135476');
  assert.equal(b.title, 'x');
  assert.deepEqual(b.tagIds, ['a']);
});

test('todayStr is local YYYY-MM-DD', () => {
  assert.equal(todayStr(new Date(2026, 9, 4)), '2026-10-04');
});

test('SEED_TAGS order', () => {
  assert.equal(SEED_TAGS[0], 'マンガ');
  assert.equal(SEED_TAGS.at(-1), '手放す候補');
  assert.equal(SEED_TAGS.length, 11);
});

test('labels', () => {
  assert.equal(LABELS.ownership.owned, '持っている');
  assert.equal(LABELS.read.reading, '読書中');
  assert.equal(LABELS.format.ebook, '電子');
});
