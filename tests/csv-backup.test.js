import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_HEADER, booksToCsv, parseCsv, rowsToBooks, csvFileName } from '../src/core/csv.js';
import { makeBackup, validateBackup, shouldRemindBackup, backupFileName } from '../src/core/backup.js';
import { newBook } from '../src/core/model.js';
import { workKeyOf } from '../src/core/volume.js';

test('csv starts with BOM and exact header', () => {
  const csv = booksToCsv([], []);
  assert.ok(csv.startsWith('﻿ISBN,書名,書名の読み,著者,出版社,発行年月,ページ数,定価,作品名,巻,種類,持っているか,読んだか,タグ,メモ,登録日,読んだ日,手放した日,更新日\r\n'));
  assert.equal(CSV_HEADER.length, 19);
});

test('csv writes labels, joins and dates', () => {
  const tags = [{ id: 't1', name: 'マンガ', order: 0 }, { id: 't2', name: '試験用', order: 1 }];
  const b = newBook({
    isbn: '9784088725093', title: 'ONE PIECE', titleKana: 'ワンピース', authors: ['尾田栄一郎', '別の人'],
    publisher: '集英社', issued: '1997-12', pages: 207, price: 410, workTitle: 'ONE PIECE', volume: 1,
    ownership: 'owned', readStatus: 'read', tagIds: ['t1', 't2'], createdAt: '2026-10-24T03:00:00.000Z',
    updatedAt: '2026-10-25T03:00:00.000Z', readAt: '2026-10-24',
  });
  const line = booksToCsv([b], tags).split('\r\n')[1];
  assert.equal(line, '9784088725093,ONE PIECE,ワンピース,尾田栄一郎、別の人,集英社,1997-12,207,410,ONE PIECE,1,紙,持っている,読んだ,マンガ、試験用,,2026-10-24,2026-10-24,,2026-10-25');
});

test('csv round-trip keeps tricky memo', () => {
  const tags = [{ id: 't1', name: 'TRPG', order: 0 }, { id: 't2', name: 'あとで 読む', order: 1 }];
  const b = newBook({
    isbn: '9784763135476', title: '本, "題"', authors: ['A', 'B'], memo: '一行目, "引用"\n二行目\r\n三行目',
    tagIds: ['t1', 't2'], ownership: 'released', readStatus: 'reading', format: 'ebook', price: 1400, volume: 3, workTitle: '作品',
  });
  const [{ book, tagNames }] = rowsToBooks(parseCsv(booksToCsv([b], tags)));
  assert.equal(book.title, b.title);
  assert.equal(book.memo, '一行目, "引用"\n二行目\n三行目');
  assert.deepEqual(book.authors, ['A', 'B']);
  assert.deepEqual(tagNames, ['TRPG', 'あとで 読む']);
  assert.deepEqual(book.tagIds, []);
  assert.equal(book.ownership, 'released');
  assert.equal(book.readStatus, 'reading');
  assert.equal(book.format, 'ebook');
  assert.equal(book.price, 1400);
  assert.equal(book.volume, 3);
  assert.equal(book.isbn, '9784763135476');
  assert.equal(book.lookup, 'ok');
  assert.equal(book.workKey, workKeyOf('作品', ['A', 'B']));
});

test('parseCsv handles LF, CRLF, empty fields and trailing newline', () => {
  assert.deepEqual(parseCsv('a,b\nc,"d\ne"\n'), [['a', 'b'], ['c', 'd\ne']]);
  assert.deepEqual(parseCsv('﻿a,,c\r\n'), [['a', '', 'c']]);
});

test('rowsToBooks rejects a foreign header', () => {
  assert.throws(() => rowsToBooks([['title', 'author']]), /見出し/);
  assert.throws(() => rowsToBooks([]), /見出し/);
});

test('rows: isbn-only is pending, no isbn is manual, blank lines skipped, unknown labels fall back', () => {
  const blank = Array(18).fill('');
  const rows = [
    CSV_HEADER,
    ['9784763135476', ...blank],
    ['', '手書きの本', ...Array(17).fill('')],
    [''],
    ['978-4-08-872509-3', 'x', '', '', '', '', '', '', '', '', '?', '?', '?', '', '', '', '', '', ''],
  ];
  const out = rowsToBooks(rows);
  assert.equal(out.length, 3);
  assert.equal(out[0].book.lookup, 'pending');
  assert.equal(out[1].book.lookup, 'manual');
  assert.equal('isbn' in out[1].book, false);
  assert.equal(out[2].book.isbn, '9784088725093');
  assert.equal(out[2].book.format, 'paper');
  assert.equal(out[2].book.ownership, 'owned');
  assert.equal(out[2].book.readStatus, 'unread');
});

test('rows: dates are kept', () => {
  const row = ['', 't', '', '', '', '', '', '', '', '', '紙', '手放した', '読んだ', '', '', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'];
  const { book } = rowsToBooks([CSV_HEADER, row])[0];
  assert.equal(book.createdAt.slice(0, 10), '2026-01-02');
  assert.equal(book.readAt, '2026-01-03');
  assert.equal(book.releasedAt, '2026-01-04');
  assert.equal(book.updatedAt.slice(0, 10), '2026-01-05');
});

test('validateBackup rejects foreign json', () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup({ books: [] }).ok, false);
  assert.equal(validateBackup({ app: 'sumaho-shosai', version: 1, books: [{ id: 1 }], tags: [], settings: [] }).ok, false);
  assert.equal(validateBackup({ app: 'sumaho-shosai', version: 2, books: [], tags: [], settings: [] }).ok, false);
  const good = makeBackup({ books: [newBook({ title: 'x' })], tags: [], settings: [] }, '2026-10-24T00:00:00Z');
  assert.equal(good.app, 'sumaho-shosai');
  assert.equal(good.exportedAt, '2026-10-24T00:00:00Z');
  assert.deepEqual(validateBackup(good), { ok: true });
  assert.equal(typeof validateBackup({ books: [] }).reason, 'string');
});

test('validateBackup checks tags and settings rows too', () => {
  const base = { app: 'sumaho-shosai', version: 1, books: [], tags: [], settings: [] };
  assert.equal(validateBackup({ ...base, tags: [{ name: 'x' }] }).ok, false);
  assert.equal(validateBackup({ ...base, tags: [null] }).ok, false);
  assert.equal(validateBackup({ ...base, settings: [{ value: 1 }] }).ok, false);
  assert.equal(validateBackup({ ...base, tags: [{ id: 'a', name: 'x', order: 0 }], settings: [{ key: 'k', value: 1 }] }).ok, true);
});

test('shouldRemindBackup', () => {
  const old = newBook({ createdAt: '2026-09-01T00:00:00Z' });
  assert.equal(shouldRemindBackup({ lastBackupAt: '', books: [], today: '2026-10-24' }), false);
  assert.equal(shouldRemindBackup({ lastBackupAt: '', books: [old], today: '2026-10-24' }), true); // 53 days
  assert.equal(shouldRemindBackup({ lastBackupAt: '', books: [newBook({ createdAt: '2026-10-20T00:00:00Z' })], today: '2026-10-24' }), false);
  assert.equal(shouldRemindBackup({ lastBackupAt: '2026-10-20T00:00:00Z', books: [old], today: '2026-10-24' }), false);
  assert.equal(shouldRemindBackup({ lastBackupAt: '2026-09-20T00:00:00Z', books: [old], today: '2026-10-24' }), true);
  const many = Array.from({ length: 50 }, () => newBook({ createdAt: '2026-10-22T00:00:00Z' }));
  assert.equal(shouldRemindBackup({ lastBackupAt: '2026-10-20T00:00:00Z', books: many, today: '2026-10-24' }), true);
  assert.equal(shouldRemindBackup({ lastBackupAt: '2026-10-20T00:00:00Z', books: many.slice(1), today: '2026-10-24' }), false);
});

test('file names', () => {
  assert.equal(csvFileName('2026-10-24'), '蔵書_20261024.csv');
  assert.equal(backupFileName('2026-10-24'), 'スマホ書斎_バックアップ_20261024.json');
});
