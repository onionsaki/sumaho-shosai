// Serial metadata lookup queue (spec §5 v1 の方針, §6).
// NDL is asked one request at a time with a minimum gap; openBD fills covers and gaps.

import { ndlIsbnUrl, ndlTitleSearchUrl, ndlSeriesSearchUrl, parseNdlOpenSearch, pickBestNdlItem } from './core/ndl.js';
import { openBdUrl, parseOpenBd } from './core/openbd.js';
import { mergeBookInfo } from './core/merge.js';
import { rakutenIsbnUrl, parseRakutenCover, rakutenMagazineUrl, parseRakutenMagazine } from './core/rakuten.js';
import { isMagazineCode, parseMagazineCode, magazineTitle, magazineBase, magazineKey } from './core/isbn.js';
import { newBook } from './core/model.js';

class RetryableError extends Error {}
export class OfflineError extends Error {
  constructor() { super('offline'); }
}

export function createLookupQueue({
  db,
  fetchImpl = (...args) => fetch(...args),
  DOMParserImpl = globalThis.DOMParser,
  minIntervalMs = 1000,
  retryDelaysMs = [2000, 4000, 8000],
  timeoutMs = 60000,
  sleep = ms => new Promise(r => setTimeout(r, ms)),
  now = () => Date.now(),
  isOnline = () => navigator.onLine,
  getRakutenKeys = async () => null, // {appId, accessKey} once 鬼さん has registered
}) {
  const queue = [];
  const queued = new Map(); // id -> overwrite flag
  const listeners = new Set();
  let idleWaiters = [];
  let running = false;
  let current = null;
  let lastNdlAt = -Infinity;
  let lane = Promise.resolve(); // only one NDL request at a time, from any caller
  const inLane = fn => {
    const run = lane.then(fn, fn);
    lane = run.catch(() => {});
    return run;
  };

  async function fetchText(url) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
      return { status: res.status, text: await res.text() };
    } catch {
      throw new RetryableError('network');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function throttle() {
    const wait = minIntervalMs - (now() - lastNdlAt);
    if (wait > 0) await sleep(wait);
    lastNdlAt = now();
  }

  // NDL's CDN sometimes serves a cached copy without the CORS header (found 2026-10-31), which the browser
  // rejects as a network error. A retry asks for the same search under a different address (idx=1 is the
  // default start position, so the answer is the same) to get a fresh copy that carries the header.
  const freshUrl = (url, attempt) => (attempt === 0 || /[?&]idx=/.test(url) ? url : `${url}&idx=1`);

  // Returns the response text, null for a non-retryable HTTP error, or throws.
  async function ndlFetch(url) {
    for (let attempt = 0; ; attempt++) {
      if (!isOnline()) throw new OfflineError();
      const outcome = await inLane(async () => {
        await throttle();
        try {
          const res = await fetchText(freshUrl(url, attempt));
          if (res.status === 200) return { text: res.text };
          if (res.status !== 429 && res.status < 500) return { text: null };
        } catch (err) {
          if (!(err instanceof RetryableError)) throw err;
        }
        return null; // retry
      });
      if (outcome) return outcome.text;
      if (attempt >= retryDelaysMs.length) throw new RetryableError('exhausted');
      await sleep(retryDelaysMs[attempt]);
    }
  }

  async function openBdFetch(isbn) {
    try {
      const res = await fetchText(openBdUrl(isbn));
      return res.status === 200 ? parseOpenBd(JSON.parse(res.text)) : null;
    } catch {
      return null;
    }
  }

  // Covers only; any failure just leaves the cover empty.
  let lastRakutenAt = -Infinity;
  async function rakutenCover(isbn) {
    const keys = await getRakutenKeys();
    if (!keys?.appId || !keys?.accessKey) return '';
    const wait = minIntervalMs - (now() - lastRakutenAt); // Rakuten allows about one request a second
    if (wait > 0) await sleep(wait);
    lastRakutenAt = now();
    try {
      const res = await fetchText(rakutenIsbnUrl(isbn, keys));
      return res.status === 200 ? parseRakutenCover(JSON.parse(res.text)) : '';
    } catch {
      return '';
    }
  }

  // Returns magazine info, null when Rakuten has none, or undefined when it cannot be asked (no keys or no network).
  async function magazineInfo(code) {
    const keys = await getRakutenKeys();
    if (!keys?.appId || !keys?.accessKey) return undefined;
    const wait = minIntervalMs - (now() - lastRakutenAt);
    if (wait > 0) await sleep(wait);
    lastRakutenAt = now();
    try {
      const res = await fetchText(rakutenMagazineUrl(code, keys));
      return res.status === 200 ? parseRakutenMagazine(JSON.parse(res.text)) : undefined;
    } catch {
      return undefined;
    }
  }

  async function lookupIsbn(isbn) {
    const text = await ndlFetch(ndlIsbnUrl(isbn));
    const ndl = text ? pickBestNdlItem(parseNdlOpenSearch(text, DOMParserImpl)) : null;
    const openbd = await openBdFetch(isbn);
    return { ndl, openbd };
  }

  async function processOne(id, overwrite) {
    const book = await db.getBook(id);
    if (!book || !book.isbn || !isOnline()) return;
    if (isMagazineCode(book.isbn)) {
      const info = await magazineInfo(book.isbn);
      const latest = await db.getBook(id);
      if (!latest) return;
      const key = magazineKey(book.isbn);
      const siblings = (await db.booksByWorkKey(key)).filter(b => b.id !== id);
      const known = siblings.map(b => b.workTitle || magazineBase(b.title)).find(Boolean) ?? '';
      let patch;
      if (info) {
        patch = {
          title: overwrite || !latest.title ? info.title : latest.title,
          publisher: overwrite || !latest.publisher ? info.publisher : latest.publisher,
          issued: overwrite || !latest.issued ? info.issued : latest.issued,
          coverUrl: latest.coverUrl || info.coverUrl,
          workTitle: latest.workTitle || magazineBase(info.title) || known,
          lookup: 'ok',
        };
      } else if (known || info === null) {
        // Rakuten has no such issue (back numbers), or cannot be asked: name it from an earlier issue.
        const issue = parseMagazineCode(book.isbn);
        patch = latest.title && !overwrite ? { lookup: latest.lookup } : {
          title: magazineTitle(issue, known),
          issued: latest.issued || `${issue.year}-${String(issue.month).padStart(2, '0')}`,
          workTitle: latest.workTitle || known,
          publisher: latest.publisher || siblings.find(b => b.publisher)?.publisher || '',
          lookup: known ? 'ok' : 'not_found',
        };
      } else {
        return; // no keys and no earlier issue: stays pending until there is a way to name it
      }
      const saved = await db.putBook({ ...latest, ...patch, workKey: key });
      for (const cb of listeners) cb(saved);
      return;
    }
    let result;
    try {
      result = await lookupIsbn(book.isbn);
    } catch {
      return; // offline or retries exhausted: the book keeps its current state
    }
    const latest = await db.getBook(id); // keep edits made while waiting
    if (!latest) return;
    const merged = mergeBookInfo(latest, result.ndl, result.openbd, { overwrite });
    if (!merged.coverUrl && merged.lookup === 'ok') merged.coverUrl = await rakutenCover(book.isbn);
    const saved = await db.putBook(merged);
    for (const cb of listeners) cb(saved);
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const id = queue.shift();
        const overwrite = queued.get(id);
        queued.delete(id);
        current = id;
        try { await processOne(id, overwrite); } catch { /* keep the queue alive */ }
        current = null;
      }
    } finally {
      running = false;
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  function add(id, overwrite) {
    if (id === current && !overwrite) return;
    if (queued.has(id)) {
      if (overwrite) queued.set(id, true);
      return;
    }
    queued.set(id, overwrite);
    queue.push(id);
    run();
  }

  return {
    enqueue: id => add(id, false),
    refetch: id => add(id, true),
    async resumePending() {
      const pending = await db.booksByLookup('pending');
      for (const b of pending) add(b.id, false);
      return pending.length;
    },
    async fetchInfo(isbn) {
      try {
        const { ndl, openbd } = await lookupIsbn(isbn);
        const merged = mergeBookInfo(newBook({ isbn }), ndl, openbd);
        if (merged.lookup !== 'ok') return null;
        if (!merged.coverUrl) merged.coverUrl = await rakutenCover(isbn);
        return merged;
      } catch {
        return null;
      }
    },
    async searchByTitle(title, author = '') {
      let text;
      try {
        text = await ndlFetch(ndlTitleSearchUrl(title, author));
      } catch (err) {
        throw err instanceof OfflineError ? err : new Error('failed');
      }
      if (!text) return [];
      const byIsbn = new Map();
      const singles = [];
      for (const item of parseNdlOpenSearch(text, DOMParserImpl)) {
        if (!item.isbn) { singles.push(item); continue; }
        byIsbn.set(item.isbn, [...(byIsbn.get(item.isbn) ?? []), item]);
      }
      return [...[...byIsbn.values()].map(pickBestNdlItem), ...singles];
    },
    // Every NDL record for one work (spin-offs included); pickSeriesVolumes keeps the main volumes.
    async searchSeries({ title, author = '', publisher = '' }) {
      let text;
      try {
        text = await ndlFetch(ndlSeriesSearchUrl({ title, author, publisher }));
      } catch (err) {
        throw err instanceof OfflineError ? err : new Error('failed');
      }
      return text ? parseNdlOpenSearch(text, DOMParserImpl) : [];
    },
    // Adds a Rakuten cover to a saved book that has none. Returns true when one was added.
    async fillCover(id) {
      const book = await db.getBook(id);
      if (!book?.isbn || book.coverUrl || !isOnline()) return false;
      const url = await rakutenCover(book.isbn);
      if (!url) return false;
      const latest = await db.getBook(id);
      if (!latest || latest.coverUrl) return false;
      const saved = await db.putBook({ ...latest, coverUrl: url });
      for (const cb of listeners) cb(saved);
      return true;
    },
    // Asks the library again for a saved book's 分類 only (books registered before 2026-10-31 lack it).
    // Returns 'found', 'none' (the library has no 分類 for it) or 'failed' (no answer: asked again next time).
    async fillClass(id) {
      const book = await db.getBook(id);
      if (book?.ndc) return 'found';
      if (!book?.isbn || !isOnline()) return 'failed';
      let ndc = '';
      try {
        const text = await ndlFetch(ndlIsbnUrl(book.isbn));
        ndc = (text ? pickBestNdlItem(parseNdlOpenSearch(text, DOMParserImpl))?.ndc : '') || '';
      } catch {
        return 'failed';
      }
      const latest = await db.getBook(id);
      if (!latest) return 'failed';
      const saved = await db.putBook({ ...latest, ndc: latest.ndc || ndc, ndcChecked: true });
      for (const cb of listeners) cb(saved);
      return ndc ? 'found' : 'none';
    },
    async fetchMagazine(code) {
      const info = await magazineInfo(code);
      return info ? { ...info, isbn: code } : null;
    },
    hasRakuten: async () => Boolean((await getRakutenKeys())?.appId),
    onUpdate(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    size: () => queue.length + (running ? 1 : 0),
    idle() {
      if (!running && !queue.length) return Promise.resolve();
      return new Promise(resolve => idleWaiters.push(resolve));
    },
  };
}
