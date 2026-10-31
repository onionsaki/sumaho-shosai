// Shelf search, filters and sort (spec §4-3).

import { normalizeForSearch } from './normalize.js';
import { isStale } from './stale.js';
import { classify } from './ndc.js';

// Thousands of books (鬼さん 2026-10-25): normalised text is worked out once per book object and reused,
// so typing and re-sorting do not redo NFKC/kana work. A saved book is a new object, so edits are never stale.
const cache = new WeakMap();
const keysOf = b => {
  let k = cache.get(b);
  if (!k) {
    k = {
      hay: normalizeForSearch([b.title, b.titleKana, ...(b.authors ?? []), ...(b.authorsKana ?? []), b.workTitle, b.memo].join(' ')),
      title: normalizeForSearch(b.titleKana || b.title),
      author: normalizeForSearch((b.authorsKana ?? [])[0] || (b.authors ?? [])[0] || ''),
    };
    cache.set(b, k);
  }
  return k;
};
const haystack = b => keysOf(b).hay;
const collator = new Intl.Collator('ja');

export function filterBooks(books, filter = {}, ctx = {}) {
  const {
    query = '', ownership = [], readStatus = [], tagIds = [], classCodes = [], staleOnly = false, needsReviewOnly = false,
  } = filter;
  const terms = String(query).split(/[\s　]+/).map(normalizeForSearch).filter(Boolean);
  return books.filter(b => {
    if (ownership.length && !ownership.includes(b.ownership)) return false;
    if (readStatus.length && !readStatus.includes(b.readStatus)) return false;
    if (tagIds.length && !tagIds.every(t => b.tagIds.includes(t))) return false;
    if (classCodes.length && !classCodes.includes(classify(b.ndc)?.code)) return false; // any of the chosen 分類
    if (needsReviewOnly && b.lookup !== 'not_found') return false;
    if (staleOnly && !isStale(b, ctx.staleRules, ctx.today)) return false;
    if (terms.length) {
      const text = haystack(b);
      if (!terms.every(t => text.includes(t))) return false;
    }
    return true;
  });
}

export const SORTS = [
  ['recent', '登録した日が新しい順'],
  ['oldest', '登録した日が古い順'],
  ['kana', '書名順'],
  ['author', '著者順'],
  ['issuedNew', '発売日が新しい順'],
  ['issuedOld', '発売日が古い順'],
];

const byCreated = (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
const byTitle = (a, b) => collator.compare(keysOf(a).title, keysOf(b).title) || (a.volume ?? -1) - (b.volume ?? -1);
// Books with no release date go last in both directions.
const byIssued = dir => (a, b) => {
  if (!a.issued || !b.issued) return (a.issued ? -1 : 0) + (b.issued ? 1 : 0) || byTitle(a, b);
  return (a.issued < b.issued ? -dir : a.issued > b.issued ? dir : 0) || byTitle(a, b);
};

export function sortBooks(books, order = 'kana') {
  const copy = [...books];
  switch (order) {
    case 'recent': return copy.sort((a, b) => byCreated(b, a));
    case 'oldest': return copy.sort(byCreated);
    case 'author': return copy.sort((a, b) => collator.compare(keysOf(a).author, keysOf(b).author) || byTitle(a, b));
    case 'issuedNew': return copy.sort(byIssued(-1));
    case 'issuedOld': return copy.sort(byIssued(1));
    default: return copy.sort(byTitle);
  }
}
