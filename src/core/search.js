// Shelf search, filters and sort (spec §4-3).

import { normalizeForSearch } from './normalize.js';
import { isStale } from './stale.js';

const haystack = b => normalizeForSearch([
  b.title, b.titleKana, ...(b.authors ?? []), ...(b.authorsKana ?? []), b.workTitle, b.memo,
].join(' '));

export function filterBooks(books, filter = {}, ctx = {}) {
  const {
    query = '', ownership = [], readStatus = [], tagIds = [], staleOnly = false, needsReviewOnly = false,
  } = filter;
  const terms = String(query).split(/[\s　]+/).map(normalizeForSearch).filter(Boolean);
  return books.filter(b => {
    if (ownership.length && !ownership.includes(b.ownership)) return false;
    if (readStatus.length && !readStatus.includes(b.readStatus)) return false;
    if (tagIds.length && !tagIds.every(t => b.tagIds.includes(t))) return false;
    if (needsReviewOnly && b.lookup !== 'not_found') return false;
    if (staleOnly && !isStale(b, ctx.examTagId, ctx.staleYears, ctx.today)) return false;
    if (terms.length) {
      const text = haystack(b);
      if (!terms.every(t => text.includes(t))) return false;
    }
    return true;
  });
}

export function sortBooks(books, order = 'kana') {
  const copy = [...books];
  if (order === 'recent') return copy.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const key = b => normalizeForSearch(b.titleKana || b.title);
  return copy.sort((a, b) => key(a).localeCompare(key(b), 'ja') || (a.volume ?? -1) - (b.volume ?? -1));
}
