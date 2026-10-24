// Serial metadata lookup queue (spec §5 v1 の方針, §6).
// NDL is asked one request at a time with a minimum gap; openBD fills covers and gaps.

import { ndlIsbnUrl, ndlTitleSearchUrl, parseNdlOpenSearch, pickBestNdlItem } from './core/ndl.js';
import { openBdUrl, parseOpenBd } from './core/openbd.js';
import { mergeBookInfo } from './core/merge.js';
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
}) {
  const queue = [];
  const queued = new Map(); // id -> overwrite flag
  const listeners = new Set();
  let idleWaiters = [];
  let running = false;
  let current = null;
  let lastNdlAt = -Infinity;

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

  // Returns the response text, null for a non-retryable HTTP error, or throws.
  async function ndlFetch(url) {
    for (let attempt = 0; ; attempt++) {
      if (!isOnline()) throw new OfflineError();
      await throttle();
      try {
        const res = await fetchText(url);
        if (res.status === 200) return res.text;
        if (res.status !== 429 && res.status < 500) return null;
      } catch (err) {
        if (!(err instanceof RetryableError)) throw err;
      }
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

  async function lookupIsbn(isbn) {
    const text = await ndlFetch(ndlIsbnUrl(isbn));
    const ndl = text ? pickBestNdlItem(parseNdlOpenSearch(text, DOMParserImpl)) : null;
    const openbd = await openBdFetch(isbn);
    return { ndl, openbd };
  }

  async function processOne(id, overwrite) {
    const book = await db.getBook(id);
    if (!book || !book.isbn || !isOnline()) return;
    let result;
    try {
      result = await lookupIsbn(book.isbn);
    } catch {
      return; // offline or retries exhausted: the book keeps its current state
    }
    const latest = await db.getBook(id); // keep edits made while waiting
    if (!latest) return;
    const saved = await db.putBook(mergeBookInfo(latest, result.ndl, result.openbd, { overwrite }));
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
        return merged.lookup === 'ok' ? merged : null;
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
