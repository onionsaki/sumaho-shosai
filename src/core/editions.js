// 新しい版を確かめる (鬼さん 2026-11-01): a revised edition gets a new ISBN, so the barcode alone cannot tell.
// NDL lists every edition under the same title with its date, edition and pages; recent records often leave
// the edition empty, so newer is judged by the date (発行年月).

import { normalizeForSearch } from './normalize.js';

// Title with edition words and years taken out: 「第15版」「2026年度版」「改訂新版」「新装版」 and the like.
export function editionTitleKey(title) {
  return normalizeForSearch(editionFreeTitle(title));
}

// The same, kept readable: what is sent to NDL as the title to search for.
export function editionFreeTitle(title) {
  return String(title ?? '').normalize('NFKC')
    .replace(/[(（[［〔【][^)）\]］〕】]*版[^)）\]］〕】]*[)）\]］〕】]/g, '')
    .replace(/第?\d+(?:年度?)?版/g, '')
    .replace(/(?:改訂|改定|増補|新装|最新|新|全面改訂)+版/g, '')
    .replace(/\s+/g, ' ').trim();
}

// The volume number of a series, or null. NDL puts 「2024年度版」 in the volume field of yearly books, which
// reads as volume 2024: that is an edition, not a volume (found 2026-11-01 with スッキリわかる日商簿記).
export function seriesVolume(item) {
  const v = item.volume ?? null;
  return v === null || /版/.test(item.volumeLabel ?? '') || v >= 1900 ? null : v;
}

const better = (a, b) => (a.edition ? 1 : 0) + (a.pages ? 1 : 0) >= (b.edition ? 1 : 0) + (b.pages ? 1 : 0) ? a : b;

// The other editions newer than the book, newest first (all other editions when the book's date is unknown).
export function newerEditions(book, items) {
  const key = editionTitleKey(book.title);
  const byIsbn = new Map();
  for (const item of items) {
    if (!item.isbn || item.isbn === book.isbn || editionTitleKey(item.title) !== key) continue;
    if (seriesVolume(item) !== seriesVolume(book)) continue; // ONE PIECE 2巻 is not a new edition of 1巻
    if (book.issued && !(item.issued > book.issued)) continue;
    byIsbn.set(item.isbn, byIsbn.has(item.isbn) ? better(item, byIsbn.get(item.isbn)) : item);
  }
  return [...byIsbn.values()].sort((a, b) => (b.issued ?? '').localeCompare(a.issued ?? ''));
}
