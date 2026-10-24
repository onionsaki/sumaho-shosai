import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBook } from '../src/core/model.js';
import { mergeBookInfo } from '../src/core/merge.js';
import { workKeyOf } from '../src/core/volume.js';

test('merge fills empties, keeps user edits, sets lookup', () => {
  const book = newBook({ isbn: '9784763135476', title: '自分で直した書名', lookup: 'pending', memo: 'm' });
  const ndl = { title: 'NDL書名', authors: ['A'], pages: 254 };
  const m = mergeBookInfo(book, ndl, { coverUrl: 'https://cover.openbd.jp/x.jpg', pages: 999 });
  assert.equal(m.title, '自分で直した書名');
  assert.equal(m.pages, 254);
  assert.deepEqual(m.authors, ['A']);
  assert.equal(m.coverUrl, 'https://cover.openbd.jp/x.jpg');
  assert.equal(m.memo, 'm');
  assert.equal(m.lookup, 'ok');
});

test('overwrite replaces metadata but not user fields', () => {
  const book = newBook({ isbn: '9784763135476', title: '自分で直した書名', memo: 'm', tagIds: ['t'], ownership: 'released' });
  const m = mergeBookInfo(book, { title: 'NDL書名' }, null, { overwrite: true });
  assert.equal(m.title, 'NDL書名');
  assert.equal(m.memo, 'm');
  assert.deepEqual(m.tagIds, ['t']);
  assert.equal(m.ownership, 'released');
});

test('not found when no source has a title', () => {
  assert.equal(mergeBookInfo(newBook({ isbn: '9784763135476' }), null, null).lookup, 'not_found');
  assert.equal(mergeBookInfo(newBook({ isbn: '9784763135476' }), { title: '' }, null).lookup, 'not_found');
});

test('workKey is recomputed and the input is not mutated', () => {
  const book = newBook({ isbn: '9784088725093', lookup: 'pending' });
  const m = mergeBookInfo(book, { title: 'ONE PIECE', workTitle: 'ONE PIECE', authors: ['尾田栄一郎'], volume: 1, volumeLabel: '巻一' }, null);
  assert.equal(m.workKey, workKeyOf('ONE PIECE', ['尾田栄一郎']));
  assert.equal(m.volume, 1);
  assert.equal(book.title, '');
  assert.notEqual(m, book);
});
