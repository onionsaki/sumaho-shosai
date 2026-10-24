import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { openDb } from '../src/db.js';
import { createLookupQueue } from '../src/lookup.js';
import { newBook } from '../src/core/model.js';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const EMPTY_RSS = '<rss><channel></channel></rss>';
let n = 0;
const fresh = () => openDb(`lookup-${++n}-${Date.now()}`);

// Fake network: routes is a list of [urlSubstring, responder]; responder returns {status, body} or throws.
function fakeFetch(routes) {
  const calls = [];
  const fn = async url => {
    calls.push(url);
    for (const [part, respond] of routes) {
      if (url.includes(part)) {
        const r = typeof respond === 'function' ? respond(calls.filter(u => u.includes(part)).length) : respond;
        return { status: r.status, text: async () => r.body };
      }
    }
    return { status: 404, text: async () => '' };
  };
  fn.calls = calls;
  return fn;
}

function fakeClock() {
  let t = 0;
  const sleeps = [];
  return {
    now: () => t,
    sleep: async ms => { sleeps.push(ms); t += ms; },
    sleeps,
  };
}

const make = (db, fetchImpl, clock, extra = {}) => createLookupQueue({
  db, fetchImpl, DOMParserImpl: DOMParser, sleep: clock.sleep, now: clock.now, isOnline: () => true, ...extra,
});

test('fills a pending book from NDL + openBD', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending', memo: 'm' }));
  const fetchImpl = fakeFetch([
    ['ndlsearch', { status: 200, body: fixture('ndl-9784763135476.xml') }],
    ['openbd', { status: 200, body: '[{"summary":{"isbn":"9784763135476","title":"x","cover":"https://cover.openbd.jp/a.jpg"}}]' }],
  ]);
  const q = make(db, fetchImpl, fakeClock());
  const updates = [];
  q.onUpdate(b => updates.push(b.id));
  q.enqueue(book.id);
  await q.idle();
  const saved = await db.getBook(book.id);
  assert.equal(saved.title, '1冊20分、読まずに「わかる!」すごい読書術');
  assert.equal(saved.coverUrl, 'https://cover.openbd.jp/a.jpg');
  assert.equal(saved.lookup, 'ok');
  assert.equal(saved.memo, 'm');
  assert.deepEqual(updates, [book.id]);
});

test('not found when NDL has 0 items and openBD null', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  const q = make(db, fakeFetch([['ndlsearch', { status: 200, body: EMPTY_RSS }], ['openbd', { status: 200, body: '[null]' }]]), fakeClock());
  q.enqueue(book.id);
  await q.idle();
  assert.equal((await db.getBook(book.id)).lookup, 'not_found');
});

test('retries on 429 then succeeds', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  const clock = fakeClock();
  const fetchImpl = fakeFetch([
    ['ndlsearch', count => (count === 1 ? { status: 429, body: '' } : { status: 200, body: fixture('ndl-9784763135476.xml') })],
    ['openbd', { status: 200, body: '[null]' }],
  ]);
  const q = make(db, fetchImpl, clock);
  q.enqueue(book.id);
  await q.idle();
  assert.ok(clock.sleeps.includes(2000));
  assert.equal((await db.getBook(book.id)).lookup, 'ok');
});

test('network errors and timeouts are retried', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  const fetchImpl = fakeFetch([
    ['ndlsearch', count => { if (count === 1) throw new TypeError('Failed to fetch'); return { status: 200, body: fixture('ndl-9784763135476.xml') }; }],
    ['openbd', () => { throw new TypeError('Failed to fetch'); }],
  ]);
  const q = make(db, fetchImpl, fakeClock());
  q.enqueue(book.id);
  await q.idle();
  assert.equal((await db.getBook(book.id)).lookup, 'ok');
});

test('stays pending after retries run out', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  const clock = fakeClock();
  const fetchImpl = fakeFetch([['ndlsearch', { status: 503, body: '' }]]);
  const q = make(db, fetchImpl, clock);
  q.enqueue(book.id);
  await q.idle();
  assert.equal((await db.getBook(book.id)).lookup, 'pending');
  assert.equal(fetchImpl.calls.filter(u => u.includes('ndlsearch')).length, 4); // 1 + 3 retries
  for (const d of [2000, 4000, 8000]) assert.ok(clock.sleeps.includes(d));
});

test('offline leaves pending without fetching', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  const fetchImpl = fakeFetch([]);
  const q = make(db, fetchImpl, fakeClock(), { isOnline: () => false });
  q.enqueue(book.id);
  await q.idle();
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal((await db.getBook(book.id)).lookup, 'pending');
});

test('requests are serial and spaced by minIntervalMs', async () => {
  const db = await fresh();
  const a = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  const b = await db.putBook(newBook({ isbn: '9784088725093', lookup: 'pending' }));
  const clock = fakeClock();
  let inFlight = 0;
  let maxInFlight = 0;
  const base = fakeFetch([['ndlsearch', { status: 200, body: EMPTY_RSS }], ['openbd', { status: 200, body: '[null]' }]]);
  const fetchImpl = async url => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    try { return await base(url); } finally { inFlight--; }
  };
  const q = make(db, fetchImpl, clock, { minIntervalMs: 1500 });
  q.enqueue(a.id);
  q.enqueue(b.id);
  q.enqueue(a.id); // duplicate is ignored
  await q.idle();
  assert.equal(maxInFlight, 1);
  assert.equal(base.calls.filter(u => u.includes('ndlsearch')).length, 2);
  assert.ok(clock.sleeps.includes(1500));
});

test('resumePending re-queues pending books', async () => {
  const db = await fresh();
  await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  await db.putBook(newBook({ isbn: '9784088725093', lookup: 'pending' }));
  await db.putBook(newBook({ isbn: '9784798163710', lookup: 'ok' }));
  const q = make(db, fakeFetch([['ndlsearch', { status: 200, body: EMPTY_RSS }], ['openbd', { status: 200, body: '[null]' }]]), fakeClock());
  assert.equal(await q.resumePending(), 2);
  await q.idle();
  assert.equal((await db.booksByLookup('pending')).length, 0);
});

test('refetch overwrites metadata but keeps memo and tags', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', title: '手で直した', memo: 'm', tagIds: ['t'], lookup: 'ok' }));
  const q = make(db, fakeFetch([['ndlsearch', { status: 200, body: fixture('ndl-9784763135476.xml') }], ['openbd', { status: 200, body: '[null]' }]]), fakeClock());
  q.refetch(book.id);
  await q.idle();
  const saved = await db.getBook(book.id);
  assert.equal(saved.title, '1冊20分、読まずに「わかる!」すごい読書術');
  assert.equal(saved.memo, 'm');
  assert.deepEqual(saved.tagIds, ['t']);
});

test('edits made while the request is in flight are kept', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  const fetchImpl = fakeFetch([
    ['ndlsearch', () => ({ status: 200, body: fixture('ndl-9784763135476.xml') })],
    ['openbd', { status: 200, body: '[null]' }],
  ]);
  const slow = async url => {
    if (url.includes('ndlsearch')) await db.putBook({ ...(await db.getBook(book.id)), memo: '途中で書いた' });
    return fetchImpl(url);
  };
  const q = make(db, slow, fakeClock());
  q.enqueue(book.id);
  await q.idle();
  const saved = await db.getBook(book.id);
  assert.equal(saved.memo, '途中で書いた');
  assert.equal(saved.lookup, 'ok');
});

test('fetchInfo returns info without saving, null when not found', async () => {
  const db = await fresh();
  const q = make(db, fakeFetch([
    ['isbn=9784763135476', { status: 200, body: fixture('ndl-9784763135476.xml') }],
    ['isbn=9784088725093', { status: 200, body: EMPTY_RSS }],
    ['openbd', { status: 200, body: '[null]' }],
  ]), fakeClock());
  const info = await q.fetchInfo('9784763135476');
  assert.equal(info.title, '1冊20分、読まずに「わかる!」すごい読書術');
  assert.equal(await q.fetchInfo('9784088725093'), null);
  assert.equal((await db.allBooks()).length, 0);
});

test('searchByTitle returns one item per isbn and throws when offline', async () => {
  const db = await fresh();
  const q = make(db, fakeFetch([['title=', { status: 200, body: fixture('ndl-9784088725093.xml') }]]), fakeClock());
  const items = await q.searchByTitle('ONE PIECE', '');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'ONE PIECE');
  const off = make(db, fakeFetch([]), fakeClock(), { isOnline: () => false });
  await assert.rejects(off.searchByTitle('x', ''), /offline/);
});

test('only one NDL request is in flight across the queue, fetchInfo and title search', async () => {
  const db = await fresh();
  const a = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  let inFlight = 0;
  let max = 0;
  const fetchImpl = async url => {
    const ndl = url.includes('ndlsearch');
    if (ndl) { inFlight++; max = Math.max(max, inFlight); }
    await new Promise(r => setTimeout(r, 5));
    if (ndl) inFlight--;
    return { status: 200, text: async () => (url.includes('openbd') ? '[null]' : EMPTY_RSS) };
  };
  const q = make(db, fetchImpl, { now: () => 0, sleep: async () => {} }, { minIntervalMs: 0 });
  q.enqueue(a.id);
  await Promise.all([q.fetchInfo('9784088725093'), q.searchByTitle('x', ''), q.idle()]);
  assert.equal(max, 1);
});

test('takes the cover from Rakuten when openBD has none and keys are set', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  const fetchImpl = fakeFetch([
    ['ndlsearch', { status: 200, body: fixture('ndl-9784763135476.xml') }],
    ['openbd', { status: 200, body: '[null]' }],
    ['openapi.rakuten', { status: 200, body: '{"Items":[{"largeImageUrl":"https://thumbnail.image.rakuten.co.jp/r.jpg"}]}' }],
  ]);
  const q = make(db, fetchImpl, fakeClock(), { getRakutenKeys: async () => ({ appId: 'A', accessKey: 'K' }) });
  q.enqueue(book.id);
  await q.idle();
  assert.equal((await db.getBook(book.id)).coverUrl, 'https://thumbnail.image.rakuten.co.jp/r.jpg');
});

test('never asks Rakuten without keys', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', lookup: 'pending' }));
  const fetchImpl = fakeFetch([
    ['ndlsearch', { status: 200, body: fixture('ndl-9784763135476.xml') }],
    ['openbd', { status: 200, body: '[null]' }],
  ]);
  const q = make(db, fetchImpl, fakeClock());
  q.enqueue(book.id);
  await q.idle();
  assert.ok(!fetchImpl.calls.some(u => u.includes('rakuten')));
  assert.equal((await db.getBook(book.id)).coverUrl, '');
});

test('fillCover adds a Rakuten cover to a book that has none', async () => {
  const db = await fresh();
  const book = await db.putBook(newBook({ isbn: '9784763135476', title: 't', lookup: 'ok' }));
  const fetchImpl = fakeFetch([['openapi.rakuten', { status: 200, body: '{"Items":[{"largeImageUrl":"https://r/x.jpg"}]}' }]]);
  const q = make(db, fetchImpl, fakeClock(), { getRakutenKeys: async () => ({ appId: 'A', accessKey: 'K' }) });
  assert.equal(await q.fillCover(book.id), true);
  assert.equal((await db.getBook(book.id)).coverUrl, 'https://r/x.jpg');
  assert.equal((await db.getBook(book.id)).title, 't');
});
