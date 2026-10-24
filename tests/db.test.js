import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { newBook, SEED_TAGS } from '../src/core/model.js';

let n = 0;
const fresh = () => openDb(`test-${++n}-${Date.now()}`);

test('seeds tags and settings', async () => {
  const db = await fresh();
  const tags = await db.allTags();
  assert.deepEqual(tags.map(t => t.name), SEED_TAGS);
  assert.equal(await db.getSetting('examTagId'), tags.find(t => t.name === '試験用').id);
  assert.equal(await db.getSetting('staleYears'), 2);
  assert.equal(await db.getSetting('lastBackupAt'), '');
  assert.deepEqual(await db.getSetting('lastSession'), { ownership: 'owned', readStatus: 'read', tagIds: [] });
});

test('reopening does not seed twice', async () => {
  const name = `reopen-${Date.now()}`;
  const a = await openDb(name);
  a.close();
  const b = await openDb(name);
  assert.equal((await b.allTags()).length, SEED_TAGS.length);
});

test('stores several books without isbn', async () => {
  const db = await fresh();
  await db.putBook(newBook({ title: 'A' }));
  await db.putBook({ ...newBook({ title: 'B' }), isbn: '' });
  assert.equal((await db.allBooks()).length, 2);
});

test('putBook strips empty isbn and bumps updatedAt', async () => {
  const db = await fresh();
  const b = { ...newBook({ title: 'B' }), isbn: '', updatedAt: '2000-01-01T00:00:00.000Z' };
  const saved = await db.putBook(b);
  assert.equal('isbn' in saved, false);
  assert.notEqual(saved.updatedAt, '2000-01-01T00:00:00.000Z');
});

test('isbn is unique, findable, and duplicates are skipped on bulk add', async () => {
  const db = await fresh();
  await db.putBook(newBook({ isbn: '9784763135476' }));
  assert.ok(await db.getBookByIsbn('9784763135476'));
  assert.equal(await db.getBookByIsbn('9784088725093'), undefined);
  await assert.rejects(db.putBook(newBook({ isbn: '9784763135476' })));
  assert.deepEqual(
    await db.addBooksSkippingDuplicates([newBook({ isbn: '9784763135476' }), newBook({ title: 'x' })]),
    { added: 1, skipped: 1 },
  );
});

test('books by work key and by lookup state', async () => {
  const db = await fresh();
  await db.putBook(newBook({ workKey: 'k', volume: 1 }));
  await db.putBook(newBook({ workKey: 'k', volume: 2, lookup: 'pending' }));
  await db.putBook(newBook({ workKey: 'other' }));
  assert.equal((await db.booksByWorkKey('k')).length, 2);
  assert.equal((await db.booksByLookup('pending')).length, 1);
});

test('createTag dedupes by normalized name; deleteTag removes it from books', async () => {
  const db = await fresh();
  const t = await db.createTag('保留');
  assert.equal((await db.createTag(' 保留')).id, t.id);
  assert.equal((await db.createTag('ＴＲＰＧ')).name, 'TRPG'); // matches the seeded tag
  assert.equal((await db.allTags()).filter(x => x.name === 'TRPG').length, 1);
  const b = await db.putBook(newBook({ tagIds: [t.id] }));
  await db.deleteTag(t.id);
  assert.deepEqual((await db.getBook(b.id)).tagIds, []);
  assert.equal((await db.allTags()).some(x => x.id === t.id), false);
});

test('mergeTags moves books without duplicates', async () => {
  const db = await fresh();
  const a = await db.createTag('A');
  const b = await db.createTag('B');
  const both = await db.putBook(newBook({ tagIds: [a.id, b.id] }));
  const onlyA = await db.putBook(newBook({ tagIds: [a.id] }));
  await db.mergeTags(a.id, b.id);
  assert.deepEqual((await db.getBook(both.id)).tagIds, [b.id]);
  assert.deepEqual((await db.getBook(onlyA.id)).tagIds, [b.id]);
  assert.equal((await db.allTags()).some(x => x.id === a.id), false);
});

test('replaceAll swaps everything', async () => {
  const db = await fresh();
  await db.putBook(newBook({ title: 'old' }));
  const book = newBook({ title: 'new' });
  const tags = [{ id: 'x', name: 'X', order: 0 }];
  await db.replaceAll({ books: [book], tags, settings: [{ key: 'staleYears', value: 5 }] });
  assert.deepEqual((await db.allBooks()).map(b => b.title), ['new']);
  assert.deepEqual(await db.allTags(), tags);
  assert.equal(await db.getSetting('staleYears'), 5);
  assert.equal(await db.getSetting('examTagId'), undefined);
});

test('replaceAll keeps the backed-up updatedAt', async () => {
  const db = await fresh();
  const book = newBook({ title: 'x', updatedAt: '2026-01-01T00:00:00.000Z' });
  await db.replaceAll({ books: [book], tags: [], settings: [] });
  assert.equal((await db.getBook(book.id)).updatedAt, '2026-01-01T00:00:00.000Z');
});

test('replaceAll with a broken row changes nothing', async () => {
  const db = await fresh();
  await db.putBook(newBook({ title: 'keep' }));
  await assert.rejects(db.replaceAll({ books: [newBook({ title: 'new' })], tags: [{ name: 'no id' }], settings: [] }));
  assert.deepEqual((await db.allBooks()).map(b => b.title), ['keep']);
  assert.equal((await db.allTags()).length, SEED_TAGS.length);
});

test('allSettings lists key/value pairs', async () => {
  const db = await fresh();
  const s = await db.allSettings();
  assert.ok(s.some(x => x.key === 'staleYears' && x.value === 2));
});

// Photos live in their own store so the shelf never loads them all (鬼さん 2026-10-25: thousands of books).
test('photos are stored apart from the book and removed with it', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ title: 't' }));
  await db.putPhoto(book.id, 'data:image/jpeg;base64,AAA');
  assert.equal(await db.getPhoto(book.id), 'data:image/jpeg;base64,AAA');
  assert.equal((await db.getBook(book.id)).hasPhoto, true);
  assert.ok(!('photo' in (await db.allBooks())[0]));
  await db.deletePhoto(book.id);
  assert.equal(await db.getPhoto(book.id), undefined);
  assert.equal((await db.getBook(book.id)).hasPhoto, false);
  await db.putPhoto(book.id, 'data:x');
  await db.deleteBook(book.id);
  assert.equal(await db.getPhoto(book.id), undefined);
});

test('opening an old database moves inline photos into the photo store', async () => {
  const name = `old-${Date.now()}`;
  await new Promise((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      const d = open.result;
      const books = d.createObjectStore('books', { keyPath: 'id' });
      books.createIndex('isbn', 'isbn', { unique: true });
      books.createIndex('workKey', 'workKey');
      books.createIndex('lookup', 'lookup');
      d.createObjectStore('tags', { keyPath: 'id' });
      d.createObjectStore('settings', { keyPath: 'key' });
      books.put({ ...newBook({ title: 'with photo' }), id: 'b1', photo: 'data:old' });
      books.put({ ...newBook({ title: 'plain' }), id: 'b2', photo: '' });
    };
    open.onsuccess = () => { open.result.close(); resolve(); };
    open.onerror = () => reject(open.error);
  });
  const db = await openDb(name);
  assert.equal(await db.getPhoto('b1'), 'data:old');
  const b1 = await db.getBook('b1');
  assert.equal(b1.hasPhoto, true);
  assert.ok(!('photo' in b1));
  assert.equal((await db.getBook('b2')).hasPhoto, false);
});

test('replaceAll restores photos with the books', async () => {
  const db = await fresh();
  const book = { ...newBook({ title: 'p' }), hasPhoto: true };
  await db.replaceAll({ books: [book], tags: [], settings: [], photos: [{ id: book.id, data: 'data:p' }] });
  assert.equal(await db.getPhoto(book.id), 'data:p');
  assert.deepEqual(await db.allPhotos(), [{ id: book.id, data: 'data:p' }]);
});
