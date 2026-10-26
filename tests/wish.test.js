import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWish, splitWishes, openWishesFor, wishCandidates, wishFromBook } from '../src/core/wish.js';
import { newBook } from '../src/core/model.js';
import { openDb } from '../src/db.js';
import { makeBackup, validateBackup } from '../src/core/backup.js';

let n = 0;
const fresh = () => openDb(`wish-${++n}-${Date.now()}`);

test('open wishes come first by newest; bought ones are kept apart', () => {
  const a = newWish({ title: 'a', createdAt: '2026-10-01T00:00:00Z' });
  const b = newWish({ title: 'b', createdAt: '2026-10-02T00:00:00Z' });
  const c = newWish({ title: 'c', boughtAt: '2026-10-20' });
  const { open, bought } = splitWishes([a, c, b]);
  assert.deepEqual(open.map(w => w.title), ['b', 'a']);
  assert.deepEqual(bought.map(w => w.title), ['c']);
  assert.deepEqual(openWishesFor([a, b, c, newWish({ isbn: '9784063842760' })], '9784063842760').length, 1);
  assert.deepEqual(openWishesFor([newWish()], ''), []);
});

test('candidates from 持っていない: volumes of a work already held start unticked', () => {
  const owned = newBook({ workKey: 'w', volume: 1 });
  const series = newBook({ workKey: 'w', volume: 2, ownership: 'not_owned' });
  const picked = newBook({ title: '本屋で見た本', ownership: 'not_owned', memo: '図解が多そう' });
  const list = wishCandidates([owned, series, picked]);
  assert.deepEqual(list.map(c => [c.book.id, c.ticked]), [[series.id, false], [picked.id, true]]);
  const w = wishFromBook(picked, picked.title);
  assert.equal(w.expect, '図解が多そう');
  assert.equal(w.createdAt, picked.createdAt);
  assert.equal(w.author, '');
  assert.equal(wishFromBook(newBook({ authors: ['山田太郎', '佐藤花子'] }), 'x').author, '山田太郎、佐藤花子');
});

test('registering the book as 持っている moves its wish to 買ったもの', async () => {
  const db = await fresh();
  const wish = await db.putWish(newWish({ isbn: '9784063842760', title: '進撃の巨人 1', expect: '一気読み' }));
  await db.putBook(newBook({ isbn: '9784063842760', ownership: 'not_owned' }));
  assert.equal((await db.allWishes())[0].boughtAt, ''); // still wanted
  const book = await db.putBook({ ...(await db.getBookByIsbn('9784063842760')), ownership: 'owned' });
  const [after] = await db.allWishes();
  assert.ok(after.boughtAt);
  assert.equal(after.bookId, book.id);
  assert.equal(after.expect, '一気読み');
  await db.deleteWish(wish.id);
  assert.equal((await db.allWishes()).length, 0);
});

test('wishes travel with the backup', async () => {
  const db = await fresh();
  await db.putWish(newWish({ title: '気になる本' }));
  const backup = makeBackup({ books: [], tags: await db.allTags(), settings: [], wishes: await db.allWishes() }, '2026-10-25T00:00:00Z');
  assert.equal(validateBackup(JSON.parse(JSON.stringify(backup))).ok, true);
  const other = await fresh();
  await other.replaceAll(backup);
  assert.deepEqual((await other.allWishes()).map(w => w.title), ['気になる本']);
  assert.equal(validateBackup({ ...backup, wishes: [{ id: 1 }] }).ok, false);
});
