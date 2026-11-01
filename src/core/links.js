// つながる本: books whose memos share a word wrapped in [[ ]] (鬼さん 2026-11-01). Shown under the memo as a
// light stand-in for a graph view; tags are left out because a tag like マンガ would join hundreds of books.

import { normalizeForSearch } from './normalize.js';

// The [[ ]] words of a memo, once each, in the order written. Empty brackets are skipped.
export function linkWords(memo) {
  const seen = new Set();
  const words = [];
  for (const m of String(memo ?? '').matchAll(/\[\[([^\[\]\n]+)\]\]/g)) {
    const word = m[1].trim();
    const key = normalizeForSearch(word);
    if (!word || !key || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}

// For each [[ ]] word of the book: the other books whose memos have the same word
// (kana, width and case differences ignored).
export function connectedBooks(book, allBooks) {
  const words = linkWords(book.memo);
  if (!words.length) return [];
  const byKey = new Map(words.map(w => [normalizeForSearch(w), []]));
  for (const other of allBooks) {
    if (other.id === book.id || !other.memo?.includes('[[')) continue;
    for (const w of linkWords(other.memo)) byKey.get(normalizeForSearch(w))?.push(other);
  }
  return words.map(word => ({ word, books: byKey.get(normalizeForSearch(word)) }));
}
