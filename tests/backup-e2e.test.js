// A phone change, end to end (鬼さん 2026-10-31「携帯を変えたら見れなくなりますよね。バックアップはしっかり動きますか」):
// everything on the old phone goes into one backup file and comes back whole on an empty new phone.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { newBook } from '../src/core/model.js';
import { newWish } from '../src/core/wish.js';
import { makeBackup, validateBackup } from '../src/core/backup.js';

let n = 0;
const fresh = () => openDb(`e2e-${++n}-${Date.now()}`);
const dump = async db => ({
  books: (await db.allBooks()).sort((a, b) => a.id.localeCompare(b.id)),
  tags: await db.allTags(),
  settings: (await db.allSettings()).sort((a, b) => a.key.localeCompare(b.key)),
  photos: await db.allPhotos(),
  wishes: await db.allWishes(),
});

test('old phone → backup file → new phone: books, memos, tags, photos, wishes, settings all come back', async () => {
  const oldPhone = await fresh();
  const tag = await oldPhone.createTag('発信ネタ');
  const book = await oldPhone.putBook(newBook({
    isbn: '9784763135476', title: '読書術', ndc: '019.13', tagIds: [tag.id], readStatus: 'read',
    memo: '■学び\n型が大事, "引用"\n■意味があったか\nあった',
  }));
  await oldPhone.putBook(newBook({ title: 'ISBNのない本', lookup: 'manual', ownership: 'released', releasedAt: '2026-10-01' }));
  await oldPhone.putPhoto(book.id, `data:image/jpeg;base64,${'A'.repeat(200000)}`); // a real photo is this big or more
  await oldPhone.putWish(newWish({ title: '欲しい本', expect: '図解が多そう', where: '古本屋 550円' }));
  await oldPhone.setSetting('theme', 'blue');
  await oldPhone.staleRules();

  // What 「バックアップを作る」 writes, and what 「バックアップから戻す」 reads back from Google Drive.
  const before = await dump(oldPhone);
  const file = JSON.stringify(makeBackup(before, new Date().toISOString()));
  const read = JSON.parse(file);
  assert.equal(validateBackup(read).ok, true);

  const newPhone = await fresh();
  await newPhone.replaceAll({ books: read.books, tags: read.tags, settings: read.settings, photos: read.photos, wishes: read.wishes });
  const after = await dump(newPhone);
  assert.deepEqual(after, before);
  assert.equal((await newPhone.getBook(book.id)).memo, book.memo);
  assert.equal((await newPhone.getPhoto(book.id)).length, 200023);
});

test('the Rakuten keys never go into the backup, and a restore keeps the keys already on the phone', async () => {
  const { restoredSettings } = await import('../src/core/backup.js');
  const settings = [{ key: 'theme', value: 'blue' }, { key: 'rakutenAppId', value: 'APP' }, { key: 'rakutenAccessKey', value: 'KEY' }];
  const file = JSON.stringify(makeBackup({ books: [], tags: [], settings }, '2026-10-31T00:00:00.000Z'));
  assert.ok(!file.includes('APP') && !file.includes('KEY'));
  assert.deepEqual(JSON.parse(file).settings, [{ key: 'theme', value: 'blue' }]);
  const phone = [{ key: 'theme', value: 'green' }, { key: 'rakutenAppId', value: 'NEWAPP' }, { key: 'rakutenAccessKey', value: 'NEWKEY' }];
  assert.deepEqual(restoredSettings(JSON.parse(file).settings, phone),
    [{ key: 'theme', value: 'blue' }, { key: 'rakutenAppId', value: 'NEWAPP' }, { key: 'rakutenAccessKey', value: 'NEWKEY' }]);
  // an older backup that still has keys: used only when this phone has none
  assert.deepEqual(restoredSettings(settings, [{ key: 'theme', value: 'green' }]), settings);
});
