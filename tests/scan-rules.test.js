import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConfirmer } from '../src/core/confirm.js';
import { applyScan } from '../src/core/session.js';
import { checkResult } from '../src/core/check.js';
import { summarizeVolumes, groupWorks } from '../src/core/series.js';
import { newBook } from '../src/core/model.js';

test('confirmer needs two reads and then cools down', () => {
  const c = createConfirmer();
  assert.equal(c.push('A', 0), null);
  assert.equal(c.push('A', 100), 'A');
  assert.equal(c.push('A', 200), null);
  assert.equal(c.push('A', 2000), null); // cooldown
  assert.equal(c.push('A', 3200), null); // after cooldown, needs two reads again
  assert.equal(c.push('A', 3300), 'A');
});

test('confirmer resets on a different code or a slow second read', () => {
  const c = createConfirmer();
  c.push('A', 0);
  assert.equal(c.push('B', 50), null);
  assert.equal(c.push('A', 100), null);
  const d = createConfirmer();
  d.push('A', 0);
  assert.equal(d.push('A', 1600), null);
  assert.equal(d.push('A', 1700), 'A');
});

test('confirmer lets another book through right after one is confirmed', () => {
  const c = createConfirmer();
  c.push('A', 0); c.push('A', 100);
  c.push('B', 200);
  assert.equal(c.push('B', 300), 'B');
});

const session = (ownership, readStatus = 'read', tagIds = []) => ({ ownership, readStatus, tagIds });

test('applyScan creates with session values', () => {
  const r = applyScan(undefined, session('owned', 'read', ['t1']), '9784763135476', '2026-10-24');
  assert.equal(r.action, 'created');
  assert.equal(r.changed, true);
  assert.equal(r.before, null);
  assert.equal(r.book.isbn, '9784763135476');
  assert.equal(r.book.lookup, 'pending');
  assert.equal(r.book.ownership, 'owned');
  assert.equal(r.book.readStatus, 'read');
  assert.equal(r.book.readAt, '2026-10-24');
  assert.equal(r.book.releasedAt, '');
  assert.deepEqual(r.book.tagIds, ['t1']);
});

test('applyScan created in a release session records releasedAt', () => {
  const r = applyScan(undefined, session('released', 'unread'), '9784763135476', '2026-10-24');
  assert.equal(r.book.releasedAt, '2026-10-24');
  assert.equal(r.book.readAt, '');
});

test('applyScan duplicate: ownership from session, tags merged, read kept', () => {
  const ex = newBook({ isbn: '9784763135476', ownership: 'not_owned', readStatus: 'unread', tagIds: ['t0'] });
  const r = applyScan(ex, session('owned', 'read', ['t1']), ex.isbn, '2026-10-24');
  assert.equal(r.action, 'duplicate');
  assert.equal(r.changed, true);
  assert.equal(r.book.ownership, 'owned');
  assert.equal(r.book.readStatus, 'unread');
  assert.deepEqual(r.book.tagIds, ['t0', 't1']);
  assert.equal(r.before, ex);
  assert.equal(ex.ownership, 'not_owned'); // input untouched
});

test('applyScan duplicate in a release session records releasedAt and keeps format', () => {
  const ex = newBook({ isbn: '9784763135476', format: 'ebook' });
  const r = applyScan(ex, session('released'), ex.isbn, '2026-10-24');
  assert.equal(r.book.ownership, 'released');
  assert.equal(r.book.releasedAt, '2026-10-24');
  assert.equal(r.book.format, 'ebook');
});

test('applyScan duplicate with nothing new is unchanged', () => {
  const ex = newBook({ isbn: '9784763135476', ownership: 'owned', tagIds: ['t1'] });
  const r = applyScan(ex, session('owned', 'read', ['t1']), ex.isbn, '2026-10-24');
  assert.equal(r.action, 'duplicate');
  assert.equal(r.changed, false);
});

test('summarizeVolumes', () => {
  assert.deepEqual(summarizeVolumes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14]), { text: '1〜12, 14', missing: [13] });
  assert.deepEqual(summarizeVolumes([3, 1, 2, 2]), { text: '1〜3', missing: [] });
  assert.deepEqual(summarizeVolumes([5]), { text: '5', missing: [] });
  assert.deepEqual(summarizeVolumes([1, 3, 5, 6]), { text: '1, 3, 5〜6', missing: [2, 4] });
  assert.deepEqual(summarizeVolumes([]), { text: '', missing: [] });
});

const vol = (n, ownership = 'owned', extra = {}) =>
  newBook({ title: `作品 ${n}`, workTitle: '作品', workKey: 'k', volume: n, ownership, ...extra });

test('groupWorks groups volumes by work and counts owned ones', () => {
  const works = groupWorks([vol(2), vol(1), vol(3, 'released'), newBook({ title: '単発' }), vol(1, 'owned', { workKey: 'other', workTitle: '別作品' })]);
  assert.equal(works.length, 2);
  const w = works.find(x => x.workKey === 'k');
  assert.equal(w.workTitle, '作品');
  assert.deepEqual(w.books.map(b => b.volume), [1, 2, 3]);
  assert.deepEqual(w.ownedVolumes, [1, 2]);
  assert.deepEqual(w.summary, { text: '1〜2', missing: [] });
});

test('checkResult statuses', () => {
  assert.equal(checkResult(undefined, []).status, 'unregistered');
  assert.equal(checkResult(newBook(), []).status, 'owned');
  assert.equal(checkResult(newBook({ format: 'ebook' }), []).status, 'owned_ebook');
  assert.equal(checkResult(newBook({ ownership: 'released' }), []).status, 'released');
  assert.equal(checkResult(newBook({ ownership: 'not_owned' }), []).status, 'not_owned');
  assert.equal(checkResult(newBook(), []).work, null);
});

test('checkResult includes the work for a volume', () => {
  const owned = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => vol(n));
  const thirteen = vol(13, 'not_owned');
  const r = checkResult(thirteen, [...owned, thirteen]);
  assert.equal(r.status, 'not_owned');
  assert.equal(r.work.summary.text, '1〜12');
  assert.deepEqual(r.work.summary.missing, []);
  assert.equal(r.book, thirteen);
});

test('confirmer with a 3 s window accepts slow phones', () => {
  const c = createConfirmer({ windowMs: 3000 });
  assert.equal(c.push('A', 0), null);
  assert.equal(c.push('A', 1400), 'A'); // 1.4 s per read still confirms
});
